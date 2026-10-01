import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createNotification: vi.fn(), findInitial: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findProposal: vi.fn(), updateProposal: vi.fn(), updateChange: vi.fn(), updateChanges: vi.fn(), findChanges: vi.fn(), createHistory: vi.fn(), findLatest: vi.fn(), findRevision: vi.fn(), createRevision: vi.fn(), publishRevision: vi.fn(), findWatchers: vi.fn(), createNotifications: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { proposal: { findUnique: mocks.findInitial }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value, deleteObject: vi.fn() }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: vi.fn(), putRevisionBundle: vi.fn(), sameDependencySet: (left: string[] = [], right: string[] = []) => left.length === right.length && left.every((id) => right.includes(id)) }));

const { applyProposal, closeProposal, reviewProposalChange } = await import("./proposal-handlers");

function proposal(status = "APPROVED", reviewStatus = "APPROVED", reviewerId: string | null = "reviewer") {
  const now = new Date();
  return {
    id: "proposal", proposalNumber: 1, projectId: "target", baseRevisionId: "base", sourceRevisionId: "source", authorId: "contributor", relatedIssueId: null, reviewerId, acceptedById: null, title: "Improve header", body: "Better hierarchy", status, createdAt: now, updatedAt: now,
    project: { id: "target", slug: "target", title: "Target", ownerId: "owner", isPublic: true },
    baseRevision: { id: "base", projectId: "target", number: 10, title: "Base", isPublished: true, sourceKey: "base", previews: [] },
    sourceRevision: { id: "source", projectId: "source", number: 4, title: "Source", isPublished: true, sourceKey: "source.zip", sourceUrl: null, tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: "a".repeat(64), capabilityMode: null, capabilityUnitCount: null, adapterId: null, adapterVersion: null, adapterConfidence: null, adapterMaturity: null, project: { id: "source", slug: "source", title: "Source", ownerId: "contributor", isPublic: true }, previews: [{ id: "preview", position: 0, key: "preview.png", url: "preview.png", mimeType: "image/png", size: 12, altText: "Header" }] },
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
function review(status = "APPROVED", changeId = "change") { return reviewProposalChange(patchRequest(`/api/proposals/proposal/changes/${changeId}`, { status, comment: "Review note" }), { id: "proposal", changeId }); }
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
    mocks.findRevision.mockResolvedValue({ id: "revision-11", number: 11, title: "Accepted: Improve header" });
    mocks.findWatchers.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.lockProject,
      proposal: { findUnique: mocks.findProposal, update: mocks.updateProposal },
      change: { update: mocks.updateChange, updateMany: mocks.updateChanges, findMany: mocks.findChanges },
      changeReview: { create: mocks.createHistory },
      revision: { findFirst: mocks.findLatest, findUnique: mocks.findRevision, create: mocks.createRevision, update: mocks.publishRevision },
      projectWatch: { findMany: mocks.findWatchers },
      notification: { create: mocks.createNotification, createMany: mocks.createNotifications },
    }));
  });

  it("notifies once per aggregate review transition, including a later change request", async () => {
    state = proposal("OPEN", "PENDING", null);
    state.changeSet.changes.push({ ...state.changeSet.changes[0], id: "other-change" });
    mocks.updateChange.mockImplementation(async ({ where, data }) => Object.assign(state.changeSet.changes.find((change) => change.id === where.id)!, data));
    expect((await review("CHANGES_REQUESTED")).status).toBe(200);
    expect((await review("CHANGES_REQUESTED", "other-change")).status).toBe(200);
    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect(mocks.createNotification).toHaveBeenLastCalledWith({ data: { recipientId: "contributor", actorId: "owner", type: "PROPOSAL_CHANGES_REQUESTED", projectId: "target", proposalId: "proposal" } });
    expect((await review()).status).toBe(200);
    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect((await review("APPROVED", "other-change")).status).toBe(200);
    expect((await review("APPROVED", "other-change")).status).toBe(200);
    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.createNotification).toHaveBeenLastCalledWith({ data: { recipientId: "contributor", actorId: "owner", type: "PROPOSAL_APPROVED", projectId: "target", proposalId: "proposal" } });
    expect((await review("CHANGES_REQUESTED")).status).toBe(200);
    expect(mocks.createNotification).toHaveBeenCalledTimes(3);
  });

  it("notifies the author once for whole-document apply and skips its replay", async () => {
    expect((await apply()).status).toBe(201);
    expect((await apply()).status).toBe(200);
    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: { recipientId: "contributor", actorId: "owner", type: "PROPOSAL_APPLIED", projectId: "target", proposalId: "proposal", revisionId: "revision-11" } });
  });

  it("skips review and apply self-notifications", async () => {
    state = proposal("OPEN", "PENDING", null);
    state.authorId = "owner";
    expect((await review()).status).toBe(200);
    expect((await apply()).status).toBe(201);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("rejects the review transaction if its notification fails", async () => {
    state = proposal("OPEN", "PENDING", null);
    mocks.createNotification.mockRejectedValueOnce(new Error("notification unavailable"));
    expect((await review()).status).toBe(500);
    await expect(mocks.transaction.mock.results[0].value).rejects.toThrow("notification unavailable");
  });

  it("keeps ACCEPTED and one revision when apply wins before close", async () => {
    expect((await apply()).status).toBe(201);
    expect((await close()).status).toBe(409);
    expect(state.status).toBe("ACCEPTED");
    expect(mocks.createRevision).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["lock:source", "lock:target", "proposal", "lock:target", "proposal"]);
  });

  it("notifies watchers once for a newly applied whole-document revision", async () => {
    mocks.findWatchers.mockResolvedValue([{ userId: "watcher" }]);
    expect((await apply()).status).toBe(201);
    expect((await apply()).status).toBe(200);
    expect(mocks.createNotifications).toHaveBeenCalledOnce();
    expect(mocks.createNotifications).toHaveBeenCalledWith({ data: [{ recipientId: "watcher", actorId: "owner", type: "REVISION_PUBLISHED", projectId: "target", revisionId: "revision-11" }] });
  });

  it("does not notify preserved watchers when the target project is private", async () => {
    mocks.lockProject.mockImplementation(async (_sql: unknown, projectId: string) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: projectId !== "target" }]);
    mocks.findWatchers.mockResolvedValue([{ userId: "watcher" }]);
    expect((await apply()).status).toBe(201);
    expect(mocks.findWatchers).not.toHaveBeenCalled();
  });

  it("keeps unrecorded capability unknown for a whole-document apply", async () => {
    expect((await apply()).status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ capabilityMode: null, capabilityUnitCount: null }) }));
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
