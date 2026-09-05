import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findInitial: vi.fn(), transaction: vi.fn(), lockProject: vi.fn(), findProposal: vi.fn(), findLatest: vi.fn(), createRevision: vi.fn(), publishRevision: vi.fn(), updateProposal: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { proposal: { findUnique: mocks.findInitial }, $transaction: mocks.transaction } }));

const { POST } = await import("./route");

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "proposal", projectId: "target", baseRevisionId: "base", title: "Improve header", body: "Better hierarchy", status: "APPROVED",
    baseRevision: { id: "base", projectId: "target", isPublished: true },
    sourceRevision: { id: "source", projectId: "source", isPublished: true, sourceKey: "source.zip", sourceUrl: null, tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: "a".repeat(64), project: { ownerId: "contributor", isPublic: true }, previews: [{ position: 0, key: "preview.png", url: "preview.png", mimeType: "image/png", size: 12, altText: "Header" }] },
    changeSet: { changes: [{ type: "REPLACE_DOCUMENT", target: "whole_document", reviewStatus: "APPROVED" }] }, appliedRevision: null,
    ...overrides,
  };
}

function request(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/proposals/proposal/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("proposal apply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findInitial.mockResolvedValue({ projectId: "target", sourceRevision: { projectId: "source" } });
    mocks.lockProject.mockImplementation(async (_sql, projectId) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: true }]);
    mocks.findProposal.mockResolvedValue(proposal());
    mocks.findLatest.mockResolvedValue({ id: "base", number: 10 });
    mocks.createRevision.mockResolvedValue({ id: "staged" });
    mocks.publishRevision.mockResolvedValue({ id: "revision-11", number: 11, title: "Accepted: Improve header" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.lockProject,
      proposal: { findUnique: mocks.findProposal, update: mocks.updateProposal },
      revision: { findFirst: mocks.findLatest, create: mocks.createRevision, update: mocks.publishRevision },
    }));
  });

  it("publishes one immutable revision from the approved source in a project lock", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(201);
    expect(mocks.lockProject.mock.calls.map(([, projectId]) => projectId)).toEqual(["source", "target"]);
    expect(mocks.createRevision).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "target", number: 11, parentId: "base", sourceProposalId: "proposal", isPublished: false, previews: { create: [expect.objectContaining({ key: "preview.png" })] } }) });
    expect(mocks.publishRevision).toHaveBeenCalledWith({ where: { id: "staged" }, data: { isPublished: true }, select: { id: true, number: true, title: true } });
    expect(mocks.updateProposal).toHaveBeenCalledWith({ where: { id: "proposal" }, data: { status: "ACCEPTED", acceptedById: "owner" } });
  });

  it("blocks a stale apply until the shown latest revision is confirmed", async () => {
    mocks.findLatest.mockResolvedValue({ id: "current", number: 13 });
    const response = await POST(request(), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ latestRevision: { id: "current", number: 13 } });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("returns the existing result instead of creating a second revision", async () => {
    mocks.findProposal.mockResolvedValue(proposal({ appliedRevision: { id: "revision-11", number: 11, title: "Accepted: Improve header" } }));
    const response = await POST(request(), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ alreadyApplied: true, revision: { id: "revision-11" } });
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("blocks non-owners before creating a revision", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const response = await POST(request(), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(403);
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("re-reads a locked source project before publishing", async () => {
    mocks.findProposal.mockResolvedValue(proposal({ sourceRevision: { ...proposal().sourceRevision, project: { ownerId: "contributor", isPublic: false } } }));
    mocks.lockProject.mockImplementation(async (_sql, projectId) => [{ id: projectId, ownerId: projectId === "target" ? "owner" : "contributor", license: "MIT", isPublic: projectId === "target" }]);
    const response = await POST(request(), { params: Promise.resolve({ id: "proposal" }) });
    expect(response.status).toBe(404);
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });
});
