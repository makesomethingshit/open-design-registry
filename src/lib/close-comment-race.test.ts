import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  issueFind: vi.fn(),
  issueTxFind: vi.fn(),
  issueUpdate: vi.fn(),
  issueCommentCreate: vi.fn(),
  participationDeleteMany: vi.fn(),
  proposalFind: vi.fn(),
  proposalTxFind: vi.fn(),
  proposalUpdate: vi.fn(),
  proposalCommentCreate: vi.fn(),
  lockRaw: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    issue: { findUnique: mocks.issueFind, findFirst: mocks.issueFind, update: mocks.issueUpdate },
    issueComment: { create: mocks.issueCommentCreate },
    proposal: { findUnique: mocks.proposalFind },
    proposalComment: { create: mocks.proposalCommentCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: mocks.lockRaw,
        issue: { findUnique: mocks.issueTxFind, update: mocks.issueUpdate },
        designRequestParticipation: { deleteMany: mocks.participationDeleteMany },
        issueComment: { create: mocks.issueCommentCreate },
        proposal: { findUnique: mocks.proposalTxFind, update: mocks.proposalUpdate },
        proposalComment: { create: mocks.proposalCommentCreate },
      }),
    ),
  },
}));

const { patchIssue, postIssueComment } = await import("./issue-handlers");
const { postProposalComment, closeProposal } = await import("./proposal-handlers");

function jsonRequest(body: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Shared mutable state so sequential calls observe the winner commit,
// mirroring lock-serialized Close/Comment ordering.
let issueStatus = "OPEN";
let proposalStatus = "OPEN";
let events: string[] = [];

function fullProposal() {
  const now = new Date();
  return {
    id: "proposal",
    proposalNumber: 1,
    title: "Improve header",
    body: "Better hierarchy",
    status: proposalStatus,
    createdAt: now,
    updatedAt: now,
    projectId: "project",
    project: { id: "project", slug: "project", title: "Project", ownerId: "owner", isPublic: true },
    baseRevision: { id: "base", projectId: "project", number: 1, title: "Base", isPublished: true, sourceKey: null, capabilityMode: null, capabilityUnitCount: null, adapterId: null, adapterVersion: null, adapterConfidence: null, adapterMaturity: null, previews: [] },
    sourceRevision: { id: "source", projectId: "source", number: 1, title: "Source", isPublished: true, sourceKey: null, capabilityMode: null, capabilityUnitCount: null, adapterId: null, adapterVersion: null, adapterConfidence: null, adapterMaturity: null, project: { id: "source", slug: "source", title: "Source", ownerId: "contributor", isPublic: true }, previews: [] },
    authorId: "contributor",
    author: { id: "contributor", name: "Contributor" },
    relatedIssue: null,
    reviewer: null,
    acceptedBy: null,
    changeSet: null,
    comments: [],
    appliedRevisions: [],
  };
}

describe("close/comment race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issueStatus = "OPEN";
    proposalStatus = "OPEN";
    events = [];
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.issueFind.mockImplementation(async () => ({ status: issueStatus, project: { ownerId: "owner", isPublic: true } }));
    mocks.issueTxFind.mockImplementation(async () => {
      events.push("issue-reread");
      return { status: issueStatus, project: { isPublic: true } };
    });
    mocks.issueUpdate.mockImplementation(async (args: { data: { status: string } }) => {
      events.push("issue-write:" + args.data.status);
      issueStatus = args.data.status;
      return { id: "issue", status: issueStatus };
    });
    mocks.issueCommentCreate.mockImplementation(async () => {
      events.push("issue-comment");
      return { id: "comment" };
    });
    mocks.lockRaw.mockImplementation(async (_strings: unknown, ...values: unknown[]) => {
      events.push("lock");
      return [{ id: values[0], ownerId: "owner", license: "MIT", isPublic: true }];
    });
    mocks.proposalFind.mockImplementation(async () => fullProposal());
    mocks.proposalTxFind.mockImplementation(async () => {
      events.push("proposal-reread");
      return fullProposal();
    });
    mocks.proposalUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      events.push("proposal-write:" + String(args.data.status ? args.data.status : "touch"));
      if (args.data.status) proposalStatus = String(args.data.status);
      return fullProposal();
    });
    mocks.proposalCommentCreate.mockImplementation(async () => {
      events.push("proposal-comment");
      return { id: "comment" };
    });
  });

  it("rejects an issue comment after close wins the lock", async () => {
    expect((await patchIssue(jsonRequest({ status: "CLOSED" }), { id: "issue" })).status).toBe(200);
    expect(issueStatus).toBe("CLOSED");
    // Simulate a comment whose pre-check read OPEN before close committed.
    mocks.issueFind.mockImplementation(async () => ({ status: "OPEN", project: { ownerId: "owner", isPublic: true } }));
    events = [];
    const response = await postIssueComment(jsonRequest({ body: "late" }), { id: "issue" });
    expect(response.status).toBe(409);
    expect(mocks.issueCommentCreate).not.toHaveBeenCalled();
    expect(events).toEqual(["lock", "issue-reread"]);
  });

  it("keeps a comment written before close, then rejects later comments", async () => {
    expect((await postIssueComment(jsonRequest({ body: "early" }), { id: "issue" })).status).toBe(201);
    expect((await patchIssue(jsonRequest({ status: "CLOSED" }), { id: "issue" })).status).toBe(200);
    expect(mocks.issueCommentCreate).toHaveBeenCalledTimes(1);
    expect((await postIssueComment(jsonRequest({ body: "late" }), { id: "issue" })).status).toBe(409);
    expect(mocks.issueCommentCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects a proposal comment after close wins the lock", async () => {
    expect((await closeProposal(jsonRequest({ status: "CLOSED" }), { id: "proposal" })).status).toBe(200);
    expect(proposalStatus).toBe("CLOSED");
    // Stale pre-check snapshot: the comment read OPEN before close committed.
    mocks.proposalFind.mockImplementation(async () => ({ ...fullProposal(), status: "OPEN" }));
    events = [];
    const response = await postProposalComment(jsonRequest({ body: "late" }), { id: "proposal" });
    expect(response.status).toBe(409);
    expect(mocks.proposalCommentCreate).not.toHaveBeenCalled();
    expect(events).toEqual(["lock", "proposal-reread"]);
  });

  it("keeps a proposal comment written before close, then rejects later comments", async () => {
    expect((await postProposalComment(jsonRequest({ body: "early" }), { id: "proposal" })).status).toBe(201);
    expect((await closeProposal(jsonRequest({ status: "CLOSED" }), { id: "proposal" })).status).toBe(200);
    expect(mocks.proposalCommentCreate).toHaveBeenCalledTimes(1);
    expect((await postProposalComment(jsonRequest({ body: "late" }), { id: "proposal" })).status).toBe(409);
    expect(mocks.proposalCommentCreate).toHaveBeenCalledTimes(1);
  });
});
