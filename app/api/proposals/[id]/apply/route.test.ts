import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findInitial: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findProposal: vi.fn(), findLatest: vi.fn(), findRevision: vi.fn(), createRevision: vi.fn(), publishRevision: vi.fn(), updateProposal: vi.fn(), updateChange: vi.fn(), updateChanges: vi.fn(), updateIssue: vi.fn(), findAffectedChanges: vi.fn(), findChangeSets: vi.fn(), createHistory: vi.fn(), readBundle: vi.fn(), putBundle: vi.fn(), deleteObject: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { proposal: { findUnique: mocks.findInitial }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value, deleteObject: mocks.deleteObject }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle, putRevisionBundle: mocks.putBundle, normalizeUnitName: (value: string) => value.trim().replace(/[\\/\"\u0000-\u001f\u007f]/g, "-").trim() || null }));

const { POST } = await import("./route");

const sourceBundle = { version: 1, files: [
  { id: "source-a", name: "new-a.ai", mimeType: "application/postscript", size: 14, assetKey: "source-a-key", previewKeys: ["source-a-preview"], checksum: "a".repeat(64) },
  { id: "source-b", name: "new-b.ai", mimeType: "application/postscript", size: 15, assetKey: "source-b-key", previewKeys: ["source-b-preview"], checksum: "b".repeat(64) },
] };
const latestBundle = { version: 1, files: [
  { id: "target-a", name: "old-a.ai", mimeType: "application/postscript", size: 10, assetKey: "target-a-key", previewKeys: ["target-a-preview"], checksum: "c".repeat(64) },
  { id: "target-b", name: "old-b.ai", mimeType: "application/postscript", size: 11, assetKey: "target-b-key", previewKeys: ["target-b-preview"], checksum: "d".repeat(64) },
] };

function changes(count = 2, appliedRevisionId: string | null = null) {
  return ["a", "b"].slice(0, count).map((suffix) => ({ id: `change-${suffix}`, type: "REPLACE_ASSET", target: `old-${suffix}.ai`, targetFileId: `target-${suffix}`, name: `new-${suffix}.ai`, mimeType: "application/postscript", size: suffix === "a" ? 14 : 15, assetKey: `source-${suffix}-key`, reviewStatus: "APPROVED", reviewComment: `approved note ${suffix}`, reviewedById: `reviewer-${suffix}`, reviewedAt: new Date("2026-09-01T00:00:00Z"), appliedRevisionId }));
}

function partialApplyChanges() {
  const now = new Date("2026-09-01T00:00:00Z");
  return [
    { id: "change-a", type: "REPLACE_ASSET", target: "old-a.ai", targetFileId: "target-a", name: "new-a.ai", mimeType: "application/postscript", size: 14, assetKey: "source-a-key", reviewStatus: "APPROVED", reviewComment: "approved note a", reviewedById: "reviewer-a", reviewedAt: now, appliedRevisionId: null },
    { id: "change-b", type: "REPLACE_ASSET", target: "old-b.ai", targetFileId: "target-b", name: "new-b.ai", mimeType: "application/postscript", size: 15, assetKey: "source-b-key", reviewStatus: "APPROVED", reviewComment: "approved note b", reviewedById: "reviewer-b", reviewedAt: now, appliedRevisionId: null },
    { id: "change-c", type: "REPLACE_ASSET", target: "old-c.ai", targetFileId: "target-c", name: "new-c.ai", mimeType: "application/postscript", size: 16, assetKey: "source-c-key", reviewStatus: "CHANGES_REQUESTED", reviewComment: "please revise c", reviewedById: "reviewer-c", reviewedAt: now, appliedRevisionId: null },
  ];
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal", proposalNumber: 22, projectId: "target", baseRevisionId: "base", title: "Improve header", body: "Better hierarchy", status: "APPROVED",
    baseRevision: { id: "base", projectId: "target", isPublished: true, sourceKey: "base-bundle" },
    sourceRevision: { id: "source", projectId: "source", isPublished: true, sourceKey: "source-bundle", sourceUrl: null, tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: "a".repeat(64), previews: [{ position: 0, key: "source-a-preview", url: "source-a-preview", mimeType: "image/png", size: 12, altText: "A" }, { position: 1, key: "source-b-preview", url: "source-b-preview", mimeType: "image/png", size: 12, altText: "B" }] },
    changeSet: { id: "set", changes: changes() }, appliedRevisions: [],
    ...overrides,
  };
}

function latest(id = "base", number = 10) {
  return { id, number, sourceKey: id === "base" ? "latest-bundle" : "current-bundle", sourceUrl: null, tool: "figma", toolVersion: "1", tags: ["ui"], previews: [{ position: 0, key: "target-a-preview", url: "target-a-preview", mimeType: "image/png", size: 12, altText: "A" }, { position: 1, key: "target-b-preview", url: "target-b-preview", mimeType: "image/png", size: 12, altText: "B" }] };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/proposals/proposal/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function wholeDocumentProposal(overrides: Record<string, unknown> = {}) {
  return proposal({
    changeSet: { id: "whole-set", changes: [{ id: "whole-change", type: "REPLACE_DOCUMENT", action: "REPLACE_DOCUMENT", target: "whole_document", targetFileId: null, name: null, newName: null, kind: null, mimeType: null, size: null, assetKey: null, reviewStatus: "APPROVED", appliedRevisionId: null }] },
    ...overrides,
  });
}

describe("selective proposal apply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findInitial.mockResolvedValue({ projectId: "target", sourceRevision: { projectId: "source" } });
    mocks.lockProject.mockImplementation(async (_sql: unknown, projectId: string) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: true }]);
    mocks.findProposal.mockResolvedValue(proposal());
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10 });
    mocks.findRevision.mockResolvedValue(latest());
    mocks.findAffectedChanges.mockResolvedValue([]);
    mocks.findChangeSets.mockResolvedValue([]);
    mocks.createHistory.mockResolvedValue(undefined);
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle" ? sourceBundle : latestBundle));
    mocks.putBundle.mockResolvedValue({ checksum: "b".repeat(64) });
    mocks.createRevision.mockResolvedValue({ id: "staged" });
    mocks.publishRevision.mockResolvedValue({ id: "revision-11", number: 11, title: "Accepted: Improve header" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.lockProject,
      proposal: { findUnique: mocks.findProposal, update: mocks.updateProposal },
      revision: { findFirst: mocks.findLatest, findUnique: mocks.findRevision, create: mocks.createRevision, update: mocks.publishRevision },
      change: { update: mocks.updateChange, updateMany: mocks.updateChanges, findMany: mocks.findAffectedChanges },
      issue: { update: mocks.updateIssue },
      changeReview: { createMany: mocks.createHistory },
      changeSet: { findMany: mocks.findChangeSets },
    }));
  });

  it("publishes one bundle revision for selected approved files and preserves unapplied review state", async () => {
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "target", number: 11, parentId: "base", sourceUrl: null, sourceProposalId: "proposal", sourceChecksum: "b".repeat(64), isPublished: false }) }));
    expect(mocks.putBundle).toHaveBeenCalledOnce();
    expect(mocks.updateChanges).toHaveBeenCalledWith({ where: { id: { in: ["change-a"] } }, data: { appliedRevisionId: "revision-11" } });
    expect(mocks.updateChanges).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reviewStatus: "PENDING" }) }));
    expect(mocks.createHistory).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ eventType: "PARTIAL_APPLICATION_RESET" })]) }));
    expect(mocks.updateProposal).toHaveBeenCalledWith({ where: { id: "proposal" }, data: { status: "PARTIALLY_ACCEPTED", acceptedById: "owner" } });
  });

  it("keeps a related OPEN issue OPEN across apply", async () => {
    const issue = { id: "issue-14", status: "OPEN" };
    mocks.findProposal.mockResolvedValue(proposal({ relatedIssueId: issue.id, relatedIssue: issue }));

    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });

    expect(response.status).toBe(201);
    expect(issue.status).toBe("OPEN");
    expect(mocks.updateIssue).not.toHaveBeenCalled();
  });

  it("preserves APPROVED and CHANGES_REQUESTED review state and metadata for unapplied changes", async () => {
    const reviewedAt = new Date("2026-09-01T00:00:00Z");
    const rows = partialApplyChanges();
    const store = new Map(rows.map((row) => [row.id, { ...row }]));
    mocks.findProposal.mockResolvedValue(proposal({ changeSet: { id: "set", changes: rows } }));
    const defaultUpdateChanges = mocks.updateChanges.getMockImplementation();
    mocks.updateChanges.mockImplementation(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
      for (const id of where.id.in) Object.assign(store.get(id)!, data);
      return { count: where.id.in.length };
    });
    try {
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    // Applied change marked; B/C review state and metadata preserved by the backend.
    expect(store.get("change-a")!.appliedRevisionId).toBe("revision-11");
    expect(store.get("change-b")).toMatchObject({ reviewStatus: "APPROVED", reviewComment: "approved note b", reviewedById: "reviewer-b", reviewedAt, appliedRevisionId: null });
    expect(store.get("change-c")).toMatchObject({ reviewStatus: "CHANGES_REQUESTED", reviewComment: "please revise c", reviewedById: "reviewer-c", reviewedAt, appliedRevisionId: null });
    // P2: read the preserved B/C rows through the real GET serializer path
    // (publicProposal, also used by the GET handler) and assert the response
    // fields a refresh would render.
    const handlers = await import("@/src/lib/proposal-handlers");
    const base = proposal({ changeSet: { id: "set", changes: [...store.values()] } });
    const fullDetails = {
      ...base,
      project: { slug: "target", title: "Target" },
      relatedIssue: null, reviewer: null, acceptedBy: null,
      author: { id: "owner", name: "Owner" },
      baseRevision: { ...base.baseRevision, number: 10, title: "Base", previews: [] },
      sourceRevision: { ...base.sourceRevision, number: 11, title: "Source", project: { slug: "source", title: "Source" }, previews: [] },
      comments: [],
      appliedRevisions: [],
      changeSet: {
        id: "set",
        changes: [...store.values()].map((row) => ({
          ...row,
          reviewedBy: row.reviewedById ? { id: row.reviewedById, name: `reviewer ${row.reviewedById}` } : null,
          appliedRevision: row.appliedRevisionId ? { id: row.appliedRevisionId, number: 11, title: "Accepted" } : null,
          reviewHistory: [],
        })),
      },
    };
    const serialized = handlers.publicProposal(fullDetails as unknown as Parameters<typeof handlers.publicProposal>[0]);
    const byId = new Map(serialized.changeSet!.changes.map((change) => [change.id, change]));
    expect(byId.get("change-b")).toMatchObject({ reviewStatus: "APPROVED", reviewComment: "approved note b", appliedRevision: null });
    expect(byId.get("change-b")!.reviewedBy).toMatchObject({ id: "reviewer-b" });
    expect(byId.get("change-b")!.reviewedAt).toEqual(reviewedAt);
    expect(byId.get("change-c")).toMatchObject({ reviewStatus: "CHANGES_REQUESTED", reviewComment: "please revise c", appliedRevision: null });
    expect(byId.get("change-c")!.reviewedBy).toMatchObject({ id: "reviewer-c" });
    expect(byId.get("change-c")!.reviewedAt).toEqual(reviewedAt);
    expect(byId.get("change-a")!.appliedRevision).toMatchObject({ id: "revision-11" });
    } finally {
      mocks.updateChanges.mockImplementation(defaultUpdateChanges ?? (async () => ({ count: 0 })));
      mocks.updateChanges.mockClear();
    }
  });

  it("invalidates changed and removed units after a whole-document apply", async () => {
    mocks.findProposal.mockResolvedValue(wholeDocumentProposal());
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10, sourceKey: "latest-bundle" });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "latest-bundle"
      ? { version: 2, files: [
        { id: "changed", name: "Changed", kind: "asset", mimeType: "image/png", size: 1, assetKey: "changed-a", previewKeys: [], checksum: "a".repeat(64) },
        { id: "removed", name: "Removed", kind: "asset", mimeType: "image/png", size: 1, assetKey: "removed-a", previewKeys: [], checksum: "b".repeat(64) },
        { id: "same", name: "Same", kind: "asset", mimeType: "image/png", size: 1, assetKey: "same", previewKeys: [], checksum: "c".repeat(64) },
      ] }
      : { version: 2, files: [
        { id: "changed", name: "Changed", kind: "asset", mimeType: "image/png", size: 1, assetKey: "changed-b", previewKeys: [], checksum: "d".repeat(64) },
        { id: "same", name: "Same", kind: "asset", mimeType: "image/png", size: 1, assetKey: "same", previewKeys: [], checksum: "c".repeat(64) },
      ] }));
    mocks.findAffectedChanges.mockResolvedValue([{ id: "other-changed", changeSetId: "other-set" }, { id: "other-removed", changeSetId: "other-set" }]);
    mocks.findChangeSets.mockResolvedValue([{ proposalId: "other-proposal", changes: [{ reviewStatus: "PENDING", appliedRevisionId: null }] }]);

    const response = await POST(request({ changeIds: ["whole-change"] }), { params: Promise.resolve({ id: "proposal" }) });

    expect(response.status).toBe(201);
    expect(mocks.findAffectedChanges).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ targetFileId: { in: ["changed", "removed"] } }) }));
    expect(mocks.createHistory).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ changeId: "other-changed", eventType: "INVALIDATED_UPSTREAM", causedByRevisionId: "revision-11" }),
      expect.objectContaining({ changeId: "other-removed", eventType: "INVALIDATED_UPSTREAM", causedByRevisionId: "revision-11" }),
    ]), skipDuplicates: true });
  });

  it("keeps same-checksum and unrelated approvals out of a whole-document invalidation", async () => {
    mocks.findProposal.mockResolvedValue(wholeDocumentProposal());
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10, sourceKey: "latest-bundle" });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "latest-bundle"
      ? { version: 2, files: [
        { id: "target", name: "Target", kind: "asset", mimeType: "image/png", size: 1, assetKey: "target", previewKeys: [], checksum: "a".repeat(64) },
        { id: "unrelated", name: "Unrelated", kind: "asset", mimeType: "image/png", size: 1, assetKey: "unrelated-a", previewKeys: [], checksum: "b".repeat(64) },
      ] }
      : { version: 2, files: [
        { id: "target", name: "Target", kind: "asset", mimeType: "image/png", size: 1, assetKey: "target", previewKeys: [], checksum: "a".repeat(64) },
        { id: "unrelated", name: "Unrelated", kind: "asset", mimeType: "image/png", size: 1, assetKey: "unrelated-b", previewKeys: [], checksum: "c".repeat(64) },
      ] }));

    const response = await POST(request({ changeIds: ["whole-change"] }), { params: Promise.resolve({ id: "proposal" }) });

    expect(response.status).toBe(201);
    expect(mocks.findAffectedChanges).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ targetFileId: { in: ["unrelated"] } }) }));
  });

  it("writes no second whole-document invalidation event on an idempotent retry", async () => {
    const first = wholeDocumentProposal();
    mocks.findProposal.mockResolvedValueOnce(first).mockResolvedValueOnce({ ...first, appliedRevisions: [{ id: "revision-11", number: 11, title: "Accepted: Improve header" }] });
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10, sourceKey: "latest-bundle" });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "latest-bundle"
      ? { version: 2, files: [{ id: "unit", name: "Unit", kind: "asset", mimeType: "image/png", size: 1, assetKey: "a", previewKeys: [], checksum: "a".repeat(64) }] }
      : { version: 2, files: [{ id: "unit", name: "Unit", kind: "asset", mimeType: "image/png", size: 1, assetKey: "b", previewKeys: [], checksum: "b".repeat(64) }] }));
    mocks.findAffectedChanges.mockResolvedValue([{ id: "other-change", changeSetId: "other-set" }]);
    mocks.findChangeSets.mockResolvedValue([{ proposalId: "other-proposal", changes: [{ reviewStatus: "PENDING", appliedRevisionId: null }] }]);

    expect((await POST(request({ changeIds: ["whole-change"] }), { params: Promise.resolve({ id: "proposal" }) })).status).toBe(201);
    expect((await POST(request({ changeIds: ["whole-change"] }), { params: Promise.resolve({ id: "proposal" }) })).status).toBe(200);
    expect(mocks.createHistory).toHaveBeenCalledTimes(1);
  });

  it("fails the whole-document transaction when invalidation history cannot be written", async () => {
    mocks.findProposal.mockResolvedValue(wholeDocumentProposal());
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10, sourceKey: "latest-bundle" });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "latest-bundle"
      ? { version: 2, files: [{ id: "unit", name: "Unit", kind: "asset", mimeType: "image/png", size: 1, assetKey: "a", previewKeys: [], checksum: "a".repeat(64) }] }
      : { version: 2, files: [{ id: "unit", name: "Unit", kind: "asset", mimeType: "image/png", size: 1, assetKey: "b", previewKeys: [], checksum: "b".repeat(64) }] }));
    mocks.findAffectedChanges.mockResolvedValue([{ id: "other-change", changeSetId: "other-set" }]);
    mocks.createHistory.mockRejectedValue(new Error("history unavailable"));

    const response = await POST(request({ changeIds: ["whole-change"] }), { params: Promise.resolve({ id: "proposal" }) });

    expect(response.status).toBe(500);
    expect(mocks.updateProposal).not.toHaveBeenCalled();
  });

  it("preserves a previously applied file and reaches ACCEPTED after the remaining file is reapproved", async () => {
    await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    const [changeA, changeB] = changes();
    mocks.findProposal.mockResolvedValue(proposal({
      status: "PARTIALLY_ACCEPTED",
      changeSet: { id: "set", changes: [{ ...changeA, appliedRevisionId: "revision-11" }, changeB] },
      appliedRevisions: [{ id: "revision-11", number: 11, title: "Accepted: Improve header" }],
    }));
    mocks.findLatest.mockResolvedValue({ id: "revision-11", number: 11 });
    mocks.findRevision.mockResolvedValue(latest("revision-11", 11));
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle" ? sourceBundle : {
      version: 1,
      files: [{ ...latestBundle.files[0], assetKey: "source-a-key", previewKeys: ["source-a-preview"] }, latestBundle.files[1]],
    }));
    mocks.publishRevision.mockResolvedValue({ id: "revision-12", number: 12, title: "Accepted: Improve header" });
    const response = await POST(request({ changeIds: ["change-b"], reviewedLatestRevisionId: "revision-11", reviewedChangeIds: ["change-b"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    const bundleCall = mocks.putBundle.mock.calls.at(-1);
    expect(bundleCall).toBeDefined();
    const bundle = bundleCall![1];
    expect(bundle.files.map((file: { assetKey: string }) => file.assetKey)).toEqual(["source-a-key", "source-b-key"]);
    expect(mocks.updateProposal).toHaveBeenLastCalledWith({ where: { id: "proposal" }, data: { status: "ACCEPTED", acceptedById: "owner" } });
  });

  it("requires a fresh latest-review confirmation scoped to the selected IDs", async () => {
    mocks.findLatest.mockResolvedValue({ id: "current", number: 13 });
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ latestRevision: { id: "current", number: 13 } });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("applies after stale review when the latest bundle retains the explicit file ID", async () => {
    mocks.findLatest.mockResolvedValue({ id: "r2", number: 12 });
    mocks.findRevision.mockResolvedValue(latest("r2", 12));
    const response = await POST(request({ changeIds: ["change-a"], reviewedLatestRevisionId: "r2", reviewedChangeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledOnce();
  });

  it("keeps a removed target file as a stale-apply conflict", async () => {
    mocks.findLatest.mockResolvedValue({ id: "r2", number: 12 });
    mocks.findRevision.mockResolvedValue(latest("r2", 12));
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle" ? sourceBundle : { version: 1, files: [latestBundle.files[1]] }));
    const response = await POST(request({ changeIds: ["change-a"], reviewedLatestRevisionId: "r2", reviewedChangeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/conflict review/i) });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("blocks a stale selected unit whose checksum changed upstream", async () => {
    mocks.findLatest.mockResolvedValue({ id: "r2", number: 12 });
    mocks.findRevision.mockResolvedValue(latest("r2", 12));
    const withChecksum = (value: string, entry: typeof latestBundle.files[0]) => ({ ...entry, checksum: value.repeat(64) });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle"
      ? { version: 2, files: [withChecksum("c", sourceBundle.files[0])] }
      : key === "base-bundle"
        ? { version: 2, files: [withChecksum("a", latestBundle.files[0])] }
        : { version: 2, files: [withChecksum("b", latestBundle.files[0])] }));
    const response = await POST(request({ changeIds: ["change-a"], reviewedLatestRevisionId: "r2", reviewedChangeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ conflictChangeIds: ["change-a"] });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("records one system dismissal when this apply changes another approved unit", async () => {
    const withChecksum = (value: string, entry: typeof latestBundle.files[0]) => ({ ...entry, checksum: value.repeat(64) });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle"
      ? { version: 2, files: [withChecksum("b", sourceBundle.files[0])] }
      : { version: 2, files: [withChecksum("a", latestBundle.files[0])] }));
    mocks.findAffectedChanges.mockResolvedValue([{ id: "other-change", changeSetId: "other-set" }]);
    mocks.findChangeSets.mockResolvedValue([{ proposalId: "other-proposal", changes: [{ reviewStatus: "PENDING", appliedRevisionId: null }] }]);
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    expect(mocks.createHistory).toHaveBeenCalledWith({ data: [expect.objectContaining({ changeId: "other-change", authorId: null, eventType: "INVALIDATED_UPSTREAM", status: "PENDING", reason: "Changed upstream in Revision 11", causedByRevisionId: "revision-11" })], skipDuplicates: true });
    expect(mocks.updateChanges).toHaveBeenCalledWith({ where: { id: { in: ["other-change"] } }, data: { reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null } });
    expect(mocks.updateProposal).toHaveBeenCalledWith({ where: { id: "other-proposal" }, data: { status: "OPEN" } });
  });

  it("applies rename, modify, remove, and add as one v2 unit revision", async () => {
    const unitSource = { version: 2, files: [
      { id: "header-source", name: "Header source", kind: "component", mimeType: "image/png", size: 24, assetKey: "header-source-key", previewKeys: ["source-a-preview"] },
      { id: "hero-source", name: "Hero", kind: "artboard", mimeType: "image/png", size: 25, assetKey: "hero-source-key", previewKeys: ["source-b-preview"] },
    ] };
    const unitLatest = { version: 2, files: [
      { id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 10, assetKey: "card-key", previewKeys: ["target-a-preview"] },
      { id: "header", name: "Header", kind: "component", mimeType: "image/png", size: 11, assetKey: "header-key", previewKeys: ["target-a-preview"] },
      { id: "logo", name: "Old Logo", kind: "asset", mimeType: "image/png", size: 12, assetKey: "logo-key", previewKeys: ["target-b-preview"] },
    ] };
    const unitChanges = [
      { id: "rename", type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Card", targetFileId: "card", name: "Card", newName: "Project Card", kind: "component", mimeType: null, size: null, assetKey: null, reviewStatus: "APPROVED", appliedRevisionId: null },
      { id: "modify", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Header", targetFileId: "header", name: "Header", newName: null, kind: "component", mimeType: "image/png", size: 24, assetKey: "header-source-key", reviewStatus: "APPROVED", appliedRevisionId: null },
      { id: "remove", type: "REMOVE_UNIT", action: "REMOVE_UNIT", target: "Old Logo", targetFileId: "logo", name: "Old Logo", newName: null, kind: "asset", mimeType: "image/png", size: 12, assetKey: null, reviewStatus: "APPROVED", appliedRevisionId: null },
      { id: "add", type: "ADD_UNIT", action: "ADD_UNIT", target: "Hero", targetFileId: "reserved-hero", name: "Hero", newName: null, kind: "artboard", mimeType: "image/png", size: 25, assetKey: "hero-source-key", reviewStatus: "APPROVED", appliedRevisionId: null },
    ];
    mocks.findProposal.mockResolvedValue(proposal({ changeSet: { id: "set", changes: unitChanges } }));
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle" ? unitSource : unitLatest));
    const response = await POST(request({ changeIds: ["rename", "modify", "remove", "add"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    const bundle = mocks.putBundle.mock.calls[0][1];
    expect(bundle).toMatchObject({ version: 2 });
    expect(bundle.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "card", name: "Project Card", assetKey: "card-key", kind: "component" }),
      expect.objectContaining({ id: "header", name: "Header", assetKey: "header-source-key", kind: "component" }),
      expect.objectContaining({ id: "reserved-hero", name: "Hero", assetKey: "hero-source-key", kind: "artboard" }),
    ]));
    expect(bundle.files.some((file: { id: string }) => file.id === "logo")).toBe(false);
    expect(mocks.updateProposal).toHaveBeenCalledWith({ where: { id: "proposal" }, data: { status: "ACCEPTED", acceptedById: "owner" } });
  });

  it("applies approved rename and non-last removal changes without a source bundle", async () => {
    const unitLatest = { version: 2, files: [
      { id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 10, assetKey: "card-key", previewKeys: ["target-a-preview"] },
      { id: "logo", name: "Logo", kind: "asset", mimeType: "image/png", size: 11, assetKey: "logo-key", previewKeys: ["target-b-preview"] },
      { id: "footer", name: "Footer", kind: "component", mimeType: "image/png", size: 12, assetKey: "footer-key", previewKeys: ["target-b-preview"] },
    ] };
    const unitChanges = [
      { id: "rename", type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Card", targetFileId: "card", name: "Card", newName: "Project Card", kind: "component", mimeType: null, size: null, assetKey: null, reviewStatus: "APPROVED", appliedRevisionId: null },
      { id: "remove", type: "REMOVE_UNIT", action: "REMOVE_UNIT", target: "Logo", targetFileId: "logo", name: "Logo", newName: null, kind: "asset", mimeType: "image/png", size: 11, assetKey: null, reviewStatus: "APPROVED", appliedRevisionId: null },
    ];
    const sourceRevision = { ...proposal().sourceRevision, sourceKey: null, sourceUrl: "https://example.com/source" };
    mocks.findProposal.mockResolvedValue(proposal({ sourceRevision, changeSet: { id: "set", changes: unitChanges } }));
    mocks.readBundle.mockResolvedValue(unitLatest);
    const response = await POST(request({ changeIds: ["rename", "remove"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    expect(mocks.readBundle).toHaveBeenCalledTimes(1);
    expect(mocks.readBundle).toHaveBeenCalledWith("latest-bundle");
    const bundle = mocks.putBundle.mock.calls[0][1];
    expect(bundle.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "card", name: "Project Card", assetKey: "card-key" }),
      expect.objectContaining({ id: "footer", name: "Footer", assetKey: "footer-key" }),
    ]));
    expect(bundle.files.some((file: { id: string }) => file.id === "logo")).toBe(false);
  });

  it("blocks the last remaining unit from being removed", async () => {
    mocks.findProposal.mockResolvedValue(proposal({ changeSet: { id: "set", changes: [{ id: "remove", type: "REMOVE_UNIT", action: "REMOVE_UNIT", target: "old-a.ai", targetFileId: "target-a", name: "old-a.ai", newName: null, kind: "asset", mimeType: "application/postscript", size: 10, assetKey: null, reviewStatus: "APPROVED", appliedRevisionId: null }] } }));
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle" ? sourceBundle : { version: 2, files: [latestBundle.files[0]] }));
    const response = await POST(request({ changeIds: ["remove"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/at least one unit/i) });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("returns an existing result instead of creating a duplicate revision", async () => {
    mocks.findProposal.mockResolvedValue(proposal({ status: "PARTIALLY_ACCEPTED", changeSet: { id: "set", changes: changes(1, "revision-11") } }));
    mocks.findRevision.mockResolvedValue({ id: "revision-11", number: 11, title: "Accepted: Improve header" });
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ alreadyApplied: true, revision: { id: "revision-11" } });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("blocks a non-owner before creating a revision", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(403);
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("rechecks locked source visibility before publishing", async () => {
    mocks.lockProject.mockImplementation(async (_sql: unknown, projectId: string) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: projectId === "target" }]);
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(404);
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });
});
