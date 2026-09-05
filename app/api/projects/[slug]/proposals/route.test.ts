import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findBase: vi.fn(), findSource: vi.fn(), findIssue: vi.fn(), createProposal: vi.fn(), findMany: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findLatestProposal: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findBase, findUnique: mocks.findSource }, issue: { findFirst: mocks.findIssue }, proposal: { create: mocks.createProposal, findMany: mocks.findMany }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));

const { GET, POST } = await import("./route");

function visibleProposal(sourcePublic = true) {
  return {
    id: "proposal", projectId: "target", proposalNumber: 15, baseRevisionId: "base", sourceRevisionId: "source", authorId: "contributor", relatedIssueId: null, reviewerId: null, acceptedById: null, title: "Improve header", body: "Details", status: "OPEN", createdAt: new Date(), updatedAt: new Date(),
    project: { id: "target", slug: "target", title: "Target", ownerId: "owner", isPublic: true },
    baseRevision: { id: "base", projectId: "target", number: 10, title: "Base", isPublished: true, previews: [] },
    sourceRevision: { id: "source", projectId: "source-project", number: 1, title: "Source", isPublished: true, project: { id: "source-project", slug: "source", title: "Source", ownerId: "contributor", isPublic: sourcePublic }, previews: [] },
    author: { id: "contributor", name: "Contributor" }, relatedIssue: null, reviewer: null, acceptedBy: null,
    changeSet: { id: "set", proposalId: "proposal", createdAt: new Date(), changes: [{ id: "change", changeSetId: "set", type: "REPLACE_DOCUMENT", target: "whole_document", reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null, createdAt: new Date(), reviewedBy: null }] }, comments: [], appliedRevision: null,
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/target/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("proposal creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "contributor" } });
    mocks.findProject.mockResolvedValue({ id: "target", ownerId: "owner", isPublic: true });
    mocks.findBase.mockResolvedValue({ id: "base" });
    mocks.findSource.mockResolvedValue({ id: "source", isPublished: true, project: { ownerId: "contributor" } });
    mocks.lockProject.mockResolvedValue([{ id: "target" }]);
    mocks.findLatestProposal.mockResolvedValue({ proposalNumber: 14 });
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.lockProject, proposal: { findFirst: mocks.findLatestProposal, create: mocks.createProposal } }));
    mocks.createProposal.mockResolvedValue(visibleProposal());
  });

  it("validates title and body before creating a proposal", async () => {
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "", body: "" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(400);
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("allocates the next project proposal number with the whole-document ChangeSet", async () => {
    const response = await POST(request({ baseRevisionId: "base", sourceRevisionId: "source", title: "Improve header", body: "Explain the improvement" }), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(201);
    expect(mocks.lockProject).toHaveBeenCalledOnce();
    expect(mocks.findLatestProposal).toHaveBeenCalledWith({ where: { projectId: "target" }, orderBy: { proposalNumber: "desc" }, select: { proposalNumber: true } });
    expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ proposalNumber: 15, baseRevisionId: "base", sourceRevisionId: "source", changeSet: { create: { changes: { create: { type: "REPLACE_DOCUMENT", target: "whole_document" } } } } }) }));
    expect(await response.json()).toMatchObject({ proposalNumber: 15 });
  });

  it("does not list a proposal whose private source is unreadable", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([visibleProposal(false)]);
    const response = await GET(new Request("http://localhost/api/projects/target/proposals"), { params: Promise.resolve({ slug: "target" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
