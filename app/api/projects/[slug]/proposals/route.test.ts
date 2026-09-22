import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findBase: vi.fn(), findSource: vi.fn(), findIssue: vi.fn(), createProposal: vi.fn(), findMany: vi.fn(), count: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findLatestProposal: vi.fn(), readBundle: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findBase, findUnique: mocks.findSource }, issue: { findFirst: mocks.findIssue }, proposal: { create: mocks.createProposal, findMany: mocks.findMany, count: mocks.count }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle, normalizeUnitName: (value: string) => value.trim().replace(/[\\/\"\u0000-\u001f\u007f]/g, "-").trim() || null, sameDependencySet: (left: string[] = [], right: string[] = []) => left.length === right.length && left.every((id) => right.includes(id)) }));

const { GET, POST } = await import("./route");

const baseBundle = { version: 1, files: [{ id: "target-file", name: "poster.ai", kind: "asset", mimeType: "application/postscript", size: 20, assetKey: "target-key", previewKeys: [] }] };
const sourceBundle = { version: 1, files: [{ id: "source-file", name: "replacement.ai", kind: "asset", mimeType: "application/postscript", size: 24, assetKey: "source-key", previewKeys: [] }] };

function visibleProposal(sourcePublic = true) {
  const now = new Date();
  return {
    id: "proposal", projectId: "target", proposalNumber: 15, baseRevisionId: "base", sourceRevisionId: "source", authorId: "contributor", relatedIssueId: null, reviewerId: null, acceptedById: null, title: "Improve header", body: "Details", status: "OPEN", createdAt: now, updatedAt: now,
    project: { id: "target", slug: "target", title: "Target", ownerId: "owner", isPublic: true },
    baseRevision: { id: "base", projectId: "target", number: 10, title: "Base", isPublished: true, sourceKey: "base-bundle", previews: [] },
    sourceRevision: { id: "source", projectId: "source-project", number: 1, title: "Source", isPublished: true, sourceKey: "source-bundle", project: { id: "source-project", slug: "source", title: "Source", ownerId: "contributor", isPublic: sourcePublic }, previews: [] },
    author: { id: "contributor", name: "Contributor" }, relatedIssue: null, reviewer: null, acceptedBy: null,
    changeSet: { id: "set", proposalId: "proposal", createdAt: now, changes: [{ id: "change", changeSetId: "set", type: "REPLACE_ASSET", target: "poster.ai", targetFileId: "target-file", name: "replacement.ai", mimeType: "application/postscript", size: 24, assetKey: "source-key", reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null, appliedRevisionId: null, createdAt: now, reviewedBy: null, appliedRevision: null, reviewHistory: [] }] }, comments: [], appliedRevisions: [],
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/target/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function createBody(files: unknown[] = [{ sourceFileId: "source-file", targetFileId: "target-file" }]) {
  return { baseRevisionId: "base", sourceRevisionId: "source", title: "Improve header", body: "Explain the improvement", files };
}

describe("proposal creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "contributor" } });
    mocks.findProject.mockResolvedValue({ id: "target", ownerId: "owner", isPublic: true });
    mocks.findBase.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === "base" ? { id: "base", sourceKey: "base-bundle" } : { id: "source" }));
    mocks.findSource.mockResolvedValue({ id: "source", isPublished: true, sourceKey: "source-bundle", project: { id: "source-project", ownerId: "contributor" } });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? baseBundle : sourceBundle));
    mocks.lockProject.mockImplementation(async (_sql: unknown, projectId: string) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: true }]);
    mocks.findLatestProposal.mockImplementation(({ where }: { where: { requestId?: string } }) => Promise.resolve(where.requestId ? null : { proposalNumber: 14 }));
    mocks.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ $queryRaw: mocks.lockProject, revision: { findFirst: mocks.findBase }, proposal: { findFirst: mocks.findLatestProposal, create: mocks.createProposal } }));
    mocks.createProposal.mockResolvedValue(visibleProposal());
  });

  it("validates title, body, and the selected file list before creating a proposal", async () => {
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "", body: "", files: [] }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("derives REPLACE_ASSET metadata from the published source bundle", async () => {
    const response = await POST(request(createBody()), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ proposalNumber: 15, changeSet: { create: { changes: { create: [expect.objectContaining({ type: "REPLACE_ASSET", targetFileId: "target-file", assetKey: "source-key", size: 24 })] } } } }) }));
    const body = await response.json();
    expect(body).toMatchObject({ proposalNumber: 15 });
    expect(body.changeSet.changes[0]).not.toHaveProperty("assetKey");
  });

  it("keeps the whole-document proposal path for revisions without bundles", async () => {
    mocks.readBundle.mockResolvedValue(null);
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Replace source", body: "Use the newer opaque file" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ changeSet: { create: { changes: { create: [{ type: "REPLACE_DOCUMENT", action: "REPLACE_DOCUMENT", target: "whole_document" }] } } } }) }));
  });

  it("rejects duplicate target files without trusting client metadata", async () => {
    const response = await POST(request(createBody([{ sourceFileId: "source-file", targetFileId: "target-file" }, { sourceFileId: "source-file", targetFileId: "target-file" }])), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("creates each unit action once and reserves an ADD target ID", async () => {
    const base = { version: 2, files: [
      { id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 20, assetKey: "card-key", previewKeys: [] },
      { id: "header", name: "Header", kind: "component", mimeType: "image/png", size: 20, assetKey: "header-key", previewKeys: [] },
      { id: "logo", name: "Old Logo", kind: "asset", mimeType: "image/png", size: 20, assetKey: "logo-key", previewKeys: [] },
    ] };
    const source = { version: 2, files: [
      { id: "header-source", name: "Header source", kind: "component", mimeType: "image/png", size: 24, assetKey: "header-source-key", previewKeys: [] },
      { id: "hero", name: "Hero", kind: "artboard", mimeType: "image/png", size: 24, assetKey: "hero-key", previewKeys: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Unit changes", body: "Explain", changes: [
      { action: "RENAME_UNIT", targetFileId: "card", newName: "Project Card" },
      { action: "MODIFY_UNIT", targetFileId: "header", sourceFileId: "header-source" },
      { action: "REMOVE_UNIT", targetFileId: "logo" },
      { action: "ADD_UNIT", sourceFileId: "hero" },
    ] }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    const created = mocks.createProposal.mock.calls[0][0].data.changeSet.create.changes.create;
    expect(created.map((change: { action: string }) => change.action)).toEqual(["RENAME_UNIT", "MODIFY_UNIT", "REMOVE_UNIT", "ADD_UNIT"]);
    expect(created[0]).toMatchObject({ targetFileId: "card", newName: "Project Card", kind: "component" });
    expect(created[3]).toMatchObject({ name: "Hero", kind: "artboard" });
    expect(created[3].targetFileId).not.toBe("hero");
  });

  it("rejects a proposal whose requested units leave a dependency missing", async () => {
    const base = { version: 2, files: [{ ...baseBundle.files[0], id: "existing" }] };
    const source = { version: 3, files: [
      { ...sourceBundle.files[0], id: "source-a", assetKey: "source-a-key", kind: "component", dependencies: ["source-b"] },
      { ...sourceBundle.files[0], id: "source-b", assetKey: "source-b-key", kind: "asset", dependencies: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));

    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Add A", body: "Explain", changes: [{ action: "ADD_UNIT", sourceFileId: "source-a" }] }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Include required dependency units in this proposal." });
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("accepts a dependency included in the proposal or already in the target", async () => {
    const source = { version: 3, files: [
      { ...sourceBundle.files[0], id: "source-a", assetKey: "source-a-key", kind: "component", dependencies: ["source-b"] },
      { ...sourceBundle.files[0], id: "source-b", assetKey: "source-b-key", kind: "asset", dependencies: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? { version: 2, files: [{ ...baseBundle.files[0], id: "existing" }] } : source));
    const included = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Add A and B", body: "Explain", changes: [{ action: "ADD_UNIT", sourceFileId: "source-a" }, { action: "ADD_UNIT", sourceFileId: "source-b" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(included.status).toBe(201);

    mocks.createProposal.mockClear();
    const sourceWithExistingId = { version: 3, files: [
      { ...sourceBundle.files[0], id: "source-a", assetKey: "source-a-key", kind: "component", dependencies: ["target-b"] },
      { ...sourceBundle.files[0], id: "target-b", assetKey: "source-b-key", kind: "asset", dependencies: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? { version: 3, files: [{ ...baseBundle.files[0], id: "target-b", dependencies: [] }] } : sourceWithExistingId));
    const existing = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Add A", body: "Explain", changes: [{ action: "ADD_UNIT", sourceFileId: "source-a" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(existing.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledOnce();
  });

  it("rejects a valid source graph that becomes self-dependent after MODIFY remapping", async () => {
    const base = { version: 3, files: [{ ...baseBundle.files[0], id: "target-button", dependencies: [] }] };
    const source = { version: 3, files: [
      { ...sourceBundle.files[0], id: "source-card", assetKey: "source-card-key", kind: "component", dependencies: ["target-button"] },
      { ...sourceBundle.files[0], id: "target-button", assetKey: "source-button-key", kind: "component", dependencies: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));

    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Modify button", body: "Explain", changes: [{ action: "MODIFY_UNIT", targetFileId: "target-button", sourceFileId: "source-card" }] }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Selected unit dependencies are invalid." });
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("rejects a valid source graph whose dependencies become duplicates after remapping", async () => {
    const base = { version: 3, files: [
      { ...baseBundle.files[0], id: "target-a", dependencies: [] },
      { ...baseBundle.files[0], id: "target-b", assetKey: "target-b-key", dependencies: [] },
    ] };
    const source = { version: 3, files: [
      { ...sourceBundle.files[0], id: "source-a", assetKey: "source-a-key", kind: "component", dependencies: ["source-b", "target-b"] },
      { ...sourceBundle.files[0], id: "source-b", assetKey: "source-b-key", kind: "component", dependencies: [] },
      { ...sourceBundle.files[0], id: "target-b", assetKey: "existing-b-key", kind: "component", dependencies: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));

    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Modify units", body: "Explain", changes: [
      { action: "MODIFY_UNIT", targetFileId: "target-a", sourceFileId: "source-a" },
      { action: "MODIFY_UNIT", targetFileId: "target-b", sourceFileId: "source-b" },
    ] }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Selected unit dependencies are invalid." });
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("creates rename and non-last removal changes without a source bundle", async () => {
    const base = { version: 2, files: [
      { id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 20, assetKey: "card-key", previewKeys: [] },
      { id: "logo", name: "Logo", kind: "asset", mimeType: "image/png", size: 20, assetKey: "logo-key", previewKeys: [] },
      { id: "footer", name: "Footer", kind: "component", mimeType: "image/png", size: 20, assetKey: "footer-key", previewKeys: [] },
    ] };
    mocks.findSource.mockResolvedValue({ id: "source", isPublished: true, sourceKey: null, sourceUrl: "https://example.com/source", project: { id: "source-project", ownerId: "contributor" } });
    mocks.readBundle.mockImplementation((key: string | null | undefined) => Promise.resolve(key === "base-bundle" ? base : null));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Metadata changes", body: "Explain", changes: [
      { action: "RENAME_UNIT", targetFileId: "card", newName: "Project Card" },
      { action: "REMOVE_UNIT", targetFileId: "logo" },
    ] }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.readBundle).toHaveBeenCalledTimes(1);
    expect(mocks.readBundle).toHaveBeenCalledWith("base-bundle");
    expect(mocks.createProposal.mock.calls[0][0].data.changeSet.create.changes.create).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "RENAME_UNIT", targetFileId: "card", newName: "Project Card" }),
      expect.objectContaining({ action: "REMOVE_UNIT", targetFileId: "logo" }),
    ]));
  });

  it("blocks duplicate targets and unchanged rename values", async () => {
    const duplicate = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Duplicate", body: "Explain", changes: [{ action: "RENAME_UNIT", targetFileId: "target-file", newName: "Poster" }, { action: "REMOVE_UNIT", targetFileId: "target-file" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(duplicate.status).toBe(400);
    const unchanged = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Same", body: "Explain", changes: [{ action: "RENAME_UNIT", targetFileId: "target-file", newName: "poster.ai" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(unchanged.status).toBe(400);
  });

  it("returns an existing request ID without reserving another ADD ID", async () => {
    mocks.findLatestProposal.mockImplementation(({ where }: { where: { requestId?: string } }) => Promise.resolve(where.requestId ? visibleProposal() : { proposalNumber: 14 }));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Retry", body: "Explain", requestId: "3466d7a0-007d-4a11-b1ee-393d16ef1a34", changes: [{ action: "ADD_UNIT", sourceFileId: "source-file" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(200);
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("returns lightweight cursor summaries without change assets", async () => {
    const now = new Date();
    mocks.findMany.mockResolvedValue([{ id: "summary", proposalNumber: 3, title: "Rename card", status: "OPEN", authorId: "contributor", createdAt: now, updatedAt: now, author: { name: "Contributor" }, baseRevision: { capabilityMode: "STRUCTURED", capabilityUnitCount: 1 }, changeSet: { changes: [{ id: "change", type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Card", name: "Card", newName: "Project Card", kind: "component", reviewStatus: "APPROVED", appliedRevisionId: null }] } }]);
    mocks.count.mockResolvedValue(1);
    const response = await GET(new Request("http://localhost/api/projects/target/proposals?status=open&limit=1"), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ approved: 1, total: 1, summaries: ["Rename Card → Project Card"] }] });
  });

  it("does not list a proposal whose private source is unreadable", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost/api/projects/target/proposals"), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sourceRevision: { isPublished: true, project: { isPublic: true } } }) }));
  });
});
