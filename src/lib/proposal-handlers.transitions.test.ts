import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findInitial: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findProposal: vi.fn(), updateProposal: vi.fn(), updateChange: vi.fn(), updateChanges: vi.fn(), findChanges: vi.fn(), createHistory: vi.fn(), findLatest: vi.fn(), createRevision: vi.fn(), publishRevision: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { proposal: { findUnique: mocks.findInitial }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value, deleteObject: vi.fn() }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: vi.fn(), putRevisionBundle: vi.fn() }));

const { applyProposal, closeProposal, reviewProposalChange } = await import("./proposal-handlers");

function proposal(status = "APPROVED", reviewStatus = "APPROVED", reviewerId: string | null = "reviewer") {
  const now = new Date();
  return {
    id: "proposal", proposalNumber: 1, projectId: "target", baseRevisionId: "base", sourceRevisionId: "source", authorId: "contributor", relatedIssueId: null, reviewerId, acceptedById: null, title: "Improve header", body: "Better hierarchy", status, createdAt: now, updatedAt: now,
    project: { id: "target", slug: "target", title: "Target", ownerId: "owner", isPublic: true },
    baseRevision: { id: "base", projectId: "target", number: 10, title: "Base", isPublished: true, sourceKey: "base", previews: [] },
    sourceRevision: { id: "source", projectId: "source", number: 4, title: "Source", isPublished: true, sourceKey: "source.zip", sourceUrl: null, tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: "a".repeat(64), project: { id: "source", slug: "source", title: "Source", ownerId: "contributor", isPublic: true }, previews: [{ id: "preview", position: 0, key: "preview.png", url: "preview.png", mimeType: "image/png", size: 12, altText: "Header" }] },
    author: { id: "contributor", name: "Contributor" }, relatedIssue: null, reviewer: reviewerId ? { id: reviewerId, name: "Reviewer" } : null, acceptedBy: null,
    changeSet: { id: "set", proposalId: "proposal", createdAt: now, changes: [{ id: "change", changeSetId: "set", type: "REPLACE_DOCUMENT", target: "whole_document", targetFileId: null, name: null, mimeType: null, size: null, assetKey: null, reviewStatus, reviewComment: null, reviewedById: reviewerId, reviewedAt: reviewerId ? now : null, appliedRevisionId: null, createdAt: now, reviewedBy: reviewerId ? { id: reviewerId, name: "Reviewer" } : null, appliedRevision: null, reviewHistory: [] }] }, comments: [], appliedRevisions: [],
  };
}

let state = proposal();
let events: string[] = [];

function patchRequest(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function close() { return closeProposal(patchRequest("/api/proposals/proposal", { status: "CLOSED" }), { id: "proposal" }); }
function review() { return reviewProposalChange(patchRequest("/api/proposals/proposal/changes/change", { status: "APPROVED" }), { id: "proposal", changeId: "change" }); }
function apply() { return applyProposal(new Request("http://localhost/api/proposals/proposal/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ changeIds: ["change"] }) }), { id: "proposal" }); }

describe("proposal transition serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state = proposal();
    events = [];
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findInitial.mockImplementation(async () => ({ projectId: state.projectId, sourceRevision: { projectId: state.sourceRevision.projectId } }));
    mocks.lockProject.mockImplementation(async (_sql: unknown, projectId: string) => { events.push(`lock:${projectId}`); return [{ id: projectId, ownerId: projectId === state.projectId ? "owner" : "contributor", license: "MIT", isPublic: true }]; });
    mocks.findProposal.mockImplementation(async () => { events.push("proposal"); return state; });
    mocks.updateProposal.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state, data); return state; });
    mocks.updateChange.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state.changeSet.changes[0], data); return state.changeSet.changes[0]; });
    mocks.updateChanges.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state.changeSet.changes[0], data); });
    mocks.findChanges.mockImplementation(async () => state.changeSet.changes.map((change) => ({ reviewStatus: change.reviewStatus, appliedRevisionId: change.appliedRevisionId })));
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10 });
    mocks.createRevision.mockResolvedValue({ id: "staged" });
    mocks.publishRevision.mockResolvedValue({ id: "revision-11", number: 11, title: "Accepted: Improve header" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.lockProject,
      proposal: { findUnique: mocks.findProposal, update: mocks.updateProposal },
      change: { update: mocks.updateChange, updateMany: mocks.updateChanges, findMany: mocks.findChanges },
      changeReview: { create: mocks.createHistory },
      revision: { findFirst: mocks.findLatest, create: mocks.createRevision, update: mocks.publishRevision },
    }));
  });

  it("keeps ACCEPTED and one revision when apply wins before close", async () => {
    expect((await apply()).status).toBe(201);
    expect((await close()).status).toBe(409);
    expect(state.status).toBe("ACCEPTED");
    expect(mocks.createRevision).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["lock:source", "lock:target", "proposal", "lock:target", "proposal"]);
  });

  it("prevents apply when close wins first", async () => {
    expect((await close()).status).toBe(200);
    expect((await apply()).status).toBe(409);
    expect(state.status).toBe("CLOSED");
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("keeps reviewer provenance when apply wins before review", async () => {
    expect((await apply()).status).toBe(201);
    expect((await review()).status).toBe(409);
    expect(state.reviewerId).toBe("reviewer");
    expect(state.changeSet.changes[0].reviewedById).toBe("reviewer");
  });

  it("keeps review provenance when review wins before apply", async () => {
    state = proposal("OPEN", "PENDING", null);
    expect((await review()).status).toBe(200);
    expect((await apply()).status).toBe(201);
    expect(state.status).toBe("ACCEPTED");
    expect(state.reviewerId).toBe("owner");
    expect(state.changeSet.changes[0].reviewedById).toBe("owner");
    expect(mocks.createHistory).toHaveBeenCalledOnce();
  });

  it("allows close after review commits", async () => {
    state = proposal("OPEN", "PENDING", null);
    expect((await review()).status).toBe(200);
    expect((await close()).status).toBe(200);
    expect(state.status).toBe("CLOSED");
    expect(state.reviewerId).toBe("owner");
  });

  it("blocks review after close commits", async () => {
    state = proposal("OPEN", "PENDING", null);
    expect((await close()).status).toBe(200);
    expect((await review()).status).toBe(409);
    expect(state.status).toBe("CLOSED");
    expect(mocks.updateChange).not.toHaveBeenCalled();
  });
});
