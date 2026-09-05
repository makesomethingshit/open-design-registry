import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findBase: vi.fn(), findSource: vi.fn(), findIssue: vi.fn(), createProposal: vi.fn(), findMany: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findLatestProposal: vi.fn(), readBundle: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findBase, findUnique: mocks.findSource }, issue: { findFirst: mocks.findIssue }, proposal: { create: mocks.createProposal, findMany: mocks.findMany }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle }));

const { GET, POST } = await import("./route");

const baseBundle = { version: 1, files: [{ id: "target-file", name: "poster.ai", mimeType: "application/postscript", size: 20, assetKey: "target-key", previewKeys: [] }] };
const sourceBundle = { version: 1, files: [{ id: "source-file", name: "replacement.ai", mimeType: "application/postscript", size: 24, assetKey: "source-key", previewKeys: [] }] };

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
    mocks.findLatestProposal.mockResolvedValue({ proposalNumber: 14 });
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
    expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ changeSet: { create: { changes: { create: [{ type: "REPLACE_DOCUMENT", target: "whole_document" }] } } } }) }));
  });

  it("rejects duplicate target files without trusting client metadata", async () => {
    const response = await POST(request(createBody([{ sourceFileId: "source-file", targetFileId: "target-file" }, { sourceFileId: "source-file", targetFileId: "target-file" }])), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("does not list a proposal whose private source is unreadable", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([visibleProposal(false)]);
    const response = await GET(new Request("http://localhost/api/projects/target/proposals"), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
