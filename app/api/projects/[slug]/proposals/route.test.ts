import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createNotification: vi.fn(), findProject: vi.fn(), findBase: vi.fn(), findSource: vi.fn(), findIssue: vi.fn(), createProposal: vi.fn(), findMany: vi.fn(), count: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findLatestProposal: vi.fn(), readBundle: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findBase, findUnique: mocks.findSource }, issue: { findFirst: mocks.findIssue }, proposal: { create: mocks.createProposal, findMany: mocks.findMany, count: mocks.count }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/revision-bundle")>();
  return { ...actual, readRevisionBundle: mocks.readBundle };
});

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

function rawRequest(body: string) {
  return new Request("http://localhost/api/projects/target/proposals", { method: "POST", headers: { "content-type": "application/json" }, body });
}

function createBody(files: unknown[] = [{ sourceFileId: "source-file", targetFileId: "target-file" }]) {
  return { baseRevisionId: "base", sourceRevisionId: "source", title: "Improve header", body: "Explain the improvement", files };
}

const appliedMetadata = {
  tool: "Figma", toolVersion: null, tags: ["design"], capabilityMode: "WHOLE_DOCUMENT", capabilityUnitCount: 0,
  adapterId: null, adapterVersion: null, adapterConfidence: null, adapterMaturity: null, previews: [],
};

function baseRevision(overrides: Record<string, unknown> = {}) {
  return { id: "base", sourceKey: "base-key", sourceUrl: null, sourceChecksum: "base-checksum", ...appliedMetadata, ...overrides };
}

function sourceRevision(overrides: Record<string, unknown> = {}) {
  return { id: "source", isPublished: true, sourceKey: "source-key", sourceUrl: null, sourceChecksum: "source-checksum", ...appliedMetadata, project: { id: "source-project", ownerId: "contributor" }, ...overrides };
}

describe("proposal creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "contributor" } });
    mocks.findProject.mockResolvedValue({ id: "target", ownerId: "owner", isPublic: true });
    mocks.findBase.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === "base" ? { id: "base", sourceKey: "base-bundle" } : { id: "source" }));
    mocks.findSource.mockResolvedValue({ id: "source", isPublished: true, sourceKey: "source-bundle", project: { id: "source-project", ownerId: "contributor" } });
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? baseBundle : sourceBundle));
    mocks.lockProject.mockImplementation(async (sql: unknown, idValue: string, projectValue: string) => {
      const text = Array.isArray(sql) ? (sql as string[]).join("") : "";
      if (text.includes('"Issue"')) return idValue === "related-work" && projectValue === "target" ? [{ id: idValue }] : [];
      return [{ id: idValue, ownerId: idValue === "target" ? "owner" : "contributor", license: "MIT", isPublic: true }];
    });
    mocks.findLatestProposal.mockImplementation(({ where }: { where: { requestId?: string } }) => Promise.resolve(where.requestId ? null : { proposalNumber: 14 }));
    mocks.count.mockResolvedValue(0);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ $queryRaw: mocks.lockProject, revision: { findFirst: mocks.findBase }, proposal: { findFirst: mocks.findLatestProposal, create: mocks.createProposal }, notification: { create: mocks.createNotification } }));
    mocks.createProposal.mockResolvedValue(visibleProposal());
  });

  it("notifies only the target owner for a newly created proposal", async () => {
    expect((await POST(request(createBody()), { params: Promise.resolve({ slug: "target" }) })).status).toBe(201);
    expect(mocks.createNotification).toHaveBeenCalledOnce();
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: { recipientId: "owner", actorId: "contributor", type: "PROPOSAL_CREATED", projectId: "target", proposalId: "proposal" } });
  });

  it("does not notify the author when they own the target project", async () => {
    mocks.lockProject.mockImplementation(async (_sql: unknown, id: string) => [{ id, ownerId: "contributor", license: "MIT", isPublic: true }]);
    expect((await POST(request(createBody()), { params: Promise.resolve({ slug: "target" }) })).status).toBe(201);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("propagates notification failure through the creation transaction", async () => {
    mocks.createNotification.mockRejectedValueOnce(new Error("notification unavailable"));
    await expect(POST(request(createBody()), { params: Promise.resolve({ slug: "target" }) })).rejects.toThrow("notification unavailable");
    await expect(mocks.transaction.mock.results[0].value).rejects.toThrow("notification unavailable");
  });

  it("validates title, body, and the selected file list before creating a proposal", async () => {
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "", body: "", files: [] }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("creates a proposal related to an open issue locked inside the transaction", async () => {
    const response = await POST(request({ ...createBody(), relatedIssueId: "related-work" }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(201);
    expect(mocks.findIssue).not.toHaveBeenCalled();
    const rawCalls = mocks.lockProject.mock.calls.map((call: unknown[]) => (Array.isArray(call[0]) ? (call[0] as string[]).join("") : ""));
    const issueLockIndex = rawCalls.findIndex((sql: string) => sql.includes('"Issue"'));
    expect(issueLockIndex).toBeGreaterThan(-1);
    expect(rawCalls.slice(0, issueLockIndex).every((sql: string) => sql.includes('"Project"'))).toBe(true);
    expect(rawCalls[issueLockIndex]).toContain("FOR UPDATE");
    expect(mocks.lockProject.mock.calls[issueLockIndex].slice(1)).toEqual(["related-work", "target"]);
    expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ relatedIssueId: "related-work" }) }));
  });

  it("accepts an escaped proposal body above the old 64 KiB limit", async () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      id: "unit-" + index,
      name: "Unit " + index,
      kind: "component",
      mimeType: "image/png",
      size: 20,
      assetKey: "key-" + index,
      previewKeys: [],
    }));
    const base = { version: 2, files };
    const source = { version: 2, files: files.map((file) => ({ ...file, assetKey: "source-" + file.id })) };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));
    const changes = files.map((file) => ({ action: "RENAME_UNIT", targetFileId: file.id, newName: "가".repeat(200) }));
    const payload = { baseRevisionId: "base", sourceRevisionId: "source", title: "Escaped proposal", body: "나".repeat(10_000), changes };
    const raw = JSON.stringify(payload).replace(/[^\x20-\x7E]/g, (character) =>
      "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
    );
    expect(Buffer.byteLength(raw)).toBeGreaterThan(64 * 1024);
    const response = await POST(rawRequest(raw), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledOnce();
  });

  it("rejects a related issue that closed after the contribution page loaded (stale open page)", async () => {
    // Page loaded while OPEN, but the issue closed before submit: the in-transaction
    // FOR UPDATE lookup misses, the transaction rolls back, nothing is created.
    mocks.lockProject.mockImplementation(async (sql: unknown, idValue: string) => {
      const text = Array.isArray(sql) ? (sql as string[]).join("") : "";
      if (text.includes('"Issue"')) return [];
      return [{ id: idValue, ownerId: idValue === "target" ? "owner" : "contributor", license: "MIT", isPublic: true }];
    });
    const response = await POST(request({ ...createBody(), relatedIssueId: "related-work" }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Related issue not found" });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown issue", "missing-issue"],
    ["cross-project issue", "other-project-issue"],
  ])("rejects a %s reference", async (_label, relatedIssueId) => {
    const response = await POST(request({ ...createBody(), relatedIssueId }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Related issue not found" });
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

  it("rejects a proposal whose base and source are the same revision before request lookup or writes", async () => {
    mocks.findBase.mockResolvedValueOnce(baseRevision());
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ id: "base" }));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "base", title: "No change", body: "Same revision", requestId: "3466d7a0-007d-4a11-b1ee-393d16ef1a34" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Proposal has no changes" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findLatestProposal).not.toHaveBeenCalled();
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("rejects a whole-document proposal when verified source content, copied metadata, and previews match", async () => {
    const preview = { position: 0, key: "preview", url: "https://cdn.example/preview.png", mimeType: "image/png", size: 20, altText: "Preview" };
    mocks.findBase.mockResolvedValueOnce(baseRevision({ sourceChecksum: "a".repeat(64), previews: [preview] }));
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ sourceChecksum: "a".repeat(64), previews: [preview] }));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "No change", body: "Same file", requestId: "3466d7a0-007d-4a11-b1ee-393d16ef1a34" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Proposal has no changes" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findLatestProposal).not.toHaveBeenCalled();
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("allows a whole-document proposal when the same URL has different checksums", async () => {
    const sourceUrl = "https://example.com/design.zip";
    mocks.findBase.mockResolvedValueOnce(baseRevision({ sourceKey: null, sourceUrl, sourceChecksum: "a".repeat(64) }));
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ sourceKey: null, sourceUrl, sourceChecksum: "b".repeat(64) }));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Updated source", body: "The linked source changed" }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.createProposal).toHaveBeenCalledOnce();
  });

  it("allows a whole-document proposal when equal source checksums have different applied metadata", async () => {
    mocks.findBase.mockResolvedValueOnce(baseRevision({ sourceChecksum: "a".repeat(64) }));
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ sourceChecksum: "a".repeat(64), tool: "Illustrator" }));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Update metadata", body: "Explain" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledTimes(1);
  });

  it("allows a whole-document proposal when equal source checksums have different applied previews", async () => {
    const preview = { position: 0, key: "preview", url: "https://cdn.example/preview.png", mimeType: "image/png", size: 20, altText: "Preview" };
    mocks.findBase.mockResolvedValueOnce(baseRevision({ sourceChecksum: "a".repeat(64), previews: [preview] }));
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ sourceChecksum: "a".repeat(64), previews: [{ ...preview, altText: "Updated preview" }] }));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Update preview", body: "Explain" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledTimes(1);
  });

  it("rejects a whole-document bundle whose file checksums and applied metadata establish identical content", async () => {
    const checksum = "a".repeat(64);
    const base = { version: 2 as const, files: [{ id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 20, assetKey: "base-card", previewKeys: ["card-preview"], checksum }] };
    const source = { version: 2 as const, files: [{ ...base.files[0], assetKey: "source-card" }] };
    mocks.findBase.mockResolvedValueOnce(baseRevision({ sourceChecksum: "b".repeat(64), capabilityMode: "STRUCTURED" }));
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ sourceChecksum: "c".repeat(64), capabilityMode: "STRUCTURED" }));
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-key" ? base : source));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Same bundle", body: "No change" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Proposal has no changes" });
    expect(mocks.readBundle).toHaveBeenCalledTimes(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows a whole-document proposal when legacy bundle comparison data is unavailable", async () => {
    mocks.findBase.mockResolvedValueOnce(baseRevision({ sourceChecksum: null, capabilityMode: "STRUCTURED" }));
    mocks.findSource.mockResolvedValueOnce(sourceRevision({ sourceChecksum: null, capabilityMode: "STRUCTURED" }));
    mocks.readBundle.mockResolvedValue(null);
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Legacy source", body: "Explain" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.readBundle).toHaveBeenCalledTimes(2);
    expect(mocks.createProposal).toHaveBeenCalledTimes(1);
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

  it("rejects a checksum-confirmed no-op MODIFY_UNIT but allows a meaningful replacement", async () => {
    const checksum = "a".repeat(64);
    const base = { version: 2 as const, files: [{ id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 20, assetKey: "base-card", previewKeys: ["card-preview"], checksum }] };
    const unchangedSource = { version: 2 as const, files: [{ ...base.files[0], assetKey: "source-card" }] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : unchangedSource));
    const noOp = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Same card", body: "No change", changes: [{ action: "MODIFY_UNIT", targetFileId: "card", sourceFileId: "card" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(noOp.status).toBe(400);
    expect(await noOp.json()).toEqual({ error: "Proposal has no changes" });
    expect(mocks.createProposal).not.toHaveBeenCalled();

    const changedSource = { version: 2 as const, files: [{ ...unchangedSource.files[0], mimeType: "application/pdf" }] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : changedSource));
    const changed = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Change card format", body: "Explain", changes: [{ action: "MODIFY_UNIT", targetFileId: "card", sourceFileId: "card" }] }), { params: Promise.resolve({ slug: "target" }) });
    expect(changed.status).toBe(201);
    expect(mocks.createProposal).toHaveBeenCalledTimes(1);
  });

  it("rejects a checksum-confirmed no-op MODIFY_UNIT across different source and target IDs before writes", async () => {
    const checksum = "a".repeat(64);
    const base = { version: 2 as const, files: [{ id: "card", name: "Card", kind: "component", mimeType: "image/png", size: 20, assetKey: "base-card", previewKeys: ["card-preview"], checksum }] };
    const source = { version: 2 as const, files: [{ id: "copy", name: "Card copy", kind: "component", mimeType: "image/png", size: 20, assetKey: "source-copy", previewKeys: ["card-preview"], checksum }] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));

    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Same card", body: "No change", changes: [{ action: "MODIFY_UNIT", targetFileId: "card", sourceFileId: "copy" }] }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Proposal has no changes" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findLatestProposal).not.toHaveBeenCalled();
    expect(mocks.createProposal).not.toHaveBeenCalled();
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

  it("rejects one source unit mapped to multiple target units", async () => {
    const base = { version: 2, files: [
      { ...baseBundle.files[0], id: "target-a" },
      { ...baseBundle.files[0], id: "target-b", assetKey: "target-b-key" },
      { ...baseBundle.files[0], id: "target-c", assetKey: "target-c-key" },
    ] };
    const source = { version: 3, files: [
      { ...sourceBundle.files[0], id: "source-parent", assetKey: "source-parent-key", kind: "component", dependencies: ["source-shared"] },
      { ...sourceBundle.files[0], id: "source-shared", assetKey: "source-shared-key", kind: "asset", dependencies: [] },
    ] };
    mocks.readBundle.mockImplementation((key: string) => Promise.resolve(key === "base-bundle" ? base : source));

    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Modify units", body: "Explain", changes: [
      { action: "MODIFY_UNIT", targetFileId: "target-a", sourceFileId: "source-parent" },
      { action: "MODIFY_UNIT", targetFileId: "target-b", sourceFileId: "source-shared" },
      { action: "MODIFY_UNIT", targetFileId: "target-c", sourceFileId: "source-shared" },
    ] }), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A source unit cannot map to multiple target units." });
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

  it("rejects removing the last remaining unit without throwing", async () => {
    const base = { version: 2, files: [
      { id: "only-unit", name: "Only unit", kind: "component", mimeType: "image/png", size: 20, assetKey: "only-key", previewKeys: [] },
    ] };
    mocks.findSource.mockResolvedValue({ id: "source", isPublished: true, sourceKey: null, sourceUrl: "https://example.com/source", project: { id: "source-project", ownerId: "contributor" } });
    mocks.readBundle.mockImplementation((key: string | null | undefined) => Promise.resolve(key === "base-bundle" ? base : null));
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Remove last unit", body: "Explain", changes: [
      { action: "REMOVE_UNIT", targetFileId: "only-unit" },
    ] }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "At least one unit must remain." });
    expect(mocks.createProposal).not.toHaveBeenCalled();
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
    expect(mocks.createNotification).not.toHaveBeenCalled();
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
