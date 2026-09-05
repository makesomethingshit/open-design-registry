import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findInitial: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findProposal: vi.fn(), findLatest: vi.fn(), findRevision: vi.fn(), createRevision: vi.fn(), publishRevision: vi.fn(), updateProposal: vi.fn(), updateChanges: vi.fn(), readBundle: vi.fn(), putBundle: vi.fn(), deleteObject: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { proposal: { findUnique: mocks.findInitial }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value, deleteObject: mocks.deleteObject }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle, putRevisionBundle: mocks.putBundle }));

const { POST } = await import("./route");

const sourceBundle = { version: 1, files: [
  { id: "source-a", name: "new-a.ai", mimeType: "application/postscript", size: 14, assetKey: "source-a-key", previewKeys: ["source-a-preview"] },
  { id: "source-b", name: "new-b.ai", mimeType: "application/postscript", size: 15, assetKey: "source-b-key", previewKeys: ["source-b-preview"] },
] };
const latestBundle = { version: 1, files: [
  { id: "target-a", name: "old-a.ai", mimeType: "application/postscript", size: 10, assetKey: "target-a-key", previewKeys: ["target-a-preview"] },
  { id: "target-b", name: "old-b.ai", mimeType: "application/postscript", size: 11, assetKey: "target-b-key", previewKeys: ["target-b-preview"] },
] };

function changes(count = 2, appliedRevisionId: string | null = null) {
  return ["a", "b"].slice(0, count).map((suffix) => ({ id: `change-${suffix}`, type: "REPLACE_ASSET", target: `old-${suffix}.ai`, targetFileId: `target-${suffix}`, name: `new-${suffix}.ai`, mimeType: "application/postscript", size: suffix === "a" ? 14 : 15, assetKey: `source-${suffix}-key`, reviewStatus: "APPROVED", appliedRevisionId }));
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal", proposalNumber: 22, projectId: "target", baseRevisionId: "base", title: "Improve header", body: "Better hierarchy", status: "APPROVED",
    baseRevision: { id: "base", projectId: "target", isPublished: true },
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

describe("selective proposal apply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findInitial.mockResolvedValue({ projectId: "target", sourceRevision: { projectId: "source" } });
    mocks.lockProject.mockImplementation(async (_sql: unknown, projectId: string) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: true }]);
    mocks.findProposal.mockResolvedValue(proposal());
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10 });
    mocks.findRevision.mockResolvedValue(latest());
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "source-bundle" ? sourceBundle : latestBundle));
    mocks.putBundle.mockResolvedValue({ checksum: "b".repeat(64) });
    mocks.createRevision.mockResolvedValue({ id: "staged" });
    mocks.publishRevision.mockResolvedValue({ id: "revision-11", number: 11, title: "Accepted: Improve header" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.lockProject,
      proposal: { findUnique: mocks.findProposal, update: mocks.updateProposal },
      revision: { findFirst: mocks.findLatest, findUnique: mocks.findRevision, create: mocks.createRevision, update: mocks.publishRevision },
      change: { updateMany: mocks.updateChanges },
    }));
  });

  it("publishes one bundle revision for selected approved files and resets the rest", async () => {
    const response = await POST(request({ changeIds: ["change-a"] }), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "target", number: 11, parentId: "base", sourceUrl: null, sourceProposalId: "proposal", sourceChecksum: "b".repeat(64), isPublished: false }) }));
    expect(mocks.putBundle).toHaveBeenCalledOnce();
    expect(mocks.updateChanges).toHaveBeenCalledWith({ where: { id: { in: ["change-a"] } }, data: { appliedRevisionId: "revision-11" } });
    expect(mocks.updateProposal).toHaveBeenCalledWith({ where: { id: "proposal" }, data: { status: "PARTIALLY_ACCEPTED", acceptedById: "owner" } });
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
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/target file/i) });
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
