import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findSource: vi.fn(),
  findLatest: vi.fn(),
  createRevision: vi.fn(),
  updateRevision: vi.fn(),
  transaction: vi.fn(),
  lockProject: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value.startsWith("/api/assets?") ? value : `/api/assets?key=${encodeURIComponent(value)}` }));

const { POST } = await import("./route");

function request() {
  return new Request("http://localhost/api/projects/demo/revisions/1/restore", { method: "POST" });
}

describe("revision restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner" });
    mocks.findSource.mockResolvedValue({
      id: "revision-1",
      number: 1,
      title: "First design",
      changeDescription: "Initial layout",
      sourceKey: "revisions/project/source.zip",
      sourceUrl: null,
      isPublished: true,
      previews: [{ position: 0, key: "revisions/project/preview.png", url: "/api/assets?key=revisions%2Fproject%2Fpreview.png", mimeType: "image/png", size: 123, altText: "Hero preview" }],
    });
    mocks.findLatest.mockResolvedValue({ id: "revision-2", number: 2 });
    mocks.createRevision.mockResolvedValue({
      id: "revision-3",
      number: 3,
      parentId: "revision-2",
      title: "Restored: First design",
      changeDescription: "Restored from Revision 1",
      sourceKey: "revisions/project/source.zip",
      sourceUrl: null,
      isPublished: true,
      previews: [{ position: 0, key: "revisions/project/preview.png", url: "/api/assets?key=revisions%2Fproject%2Fpreview.png", mimeType: "image/png", size: 123, altText: "Hero preview" }],
    });
    mocks.updateRevision.mockResolvedValue({
      id: "revision-3",
      number: 3,
      parentId: "revision-2",
      title: "Restored: First design",
      changeDescription: "Restored from Revision 1",
      sourceKey: "revisions/project/source.zip",
      sourceUrl: null,
      isPublished: true,
      previews: [{ position: 0, key: "revisions/project/preview.png", url: "/api/assets?key=revisions%2Fproject%2Fpreview.png", mimeType: "image/png", size: 123, altText: "Hero preview" }],
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.lockProject,
      revision: { findUnique: mocks.findSource, findFirst: mocks.findLatest, create: mocks.createRevision, update: mocks.updateRevision },
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(response.status).toBe(401);
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-owner", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const forbidden = await POST(request(), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(forbidden.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a new revision from the historical snapshot without changing history", async () => {
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "revision-3",
      number: 3,
      parentId: "revision-2",
      title: "Restored: First design",
      changeDescription: "Restored from Revision 1",
      sourceUrl: "/api/assets?key=revisions%2Fproject%2Fsource.zip",
      previews: [{ key: "revisions/project/preview.png", url: "/api/assets?key=revisions%2Fproject%2Fpreview.png", altText: "Hero preview" }],
    });
    expect(mocks.lockProject).toHaveBeenCalledTimes(1);
    expect(mocks.createRevision).toHaveBeenCalledWith({
      data: {
        projectId: "project",
        number: 3,
        parentId: "revision-2",
        title: "Restored: First design",
        changeDescription: "Restored from Revision 1",
        sourceKey: "revisions/project/source.zip",
        sourceUrl: null,
        tool: undefined,
        toolVersion: undefined,
        tags: [],
        sourceChecksum: undefined,
        isPublished: false,
        previews: { create: [{ position: 0, key: "revisions/project/preview.png", url: "/api/assets?key=revisions%2Fproject%2Fpreview.png", mimeType: "image/png", size: 123, altText: "Hero preview" }] },
      },
    });
    expect(mocks.updateRevision).toHaveBeenCalledWith({
      where: { id: "revision-3" },
      data: { isPublished: true },
      include: { previews: true },
    });
    expect(mocks.findSource).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId_number: { projectId: "project", number: 1 } } }));
  });

  it("returns 404 for missing or unpublished historical revisions", async () => {
    mocks.findSource.mockResolvedValueOnce(null);
    const missing = await POST(request(), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(missing.status).toBe(404);
    expect(mocks.createRevision).not.toHaveBeenCalled();

    mocks.findSource.mockResolvedValueOnce({ isPublished: false });
    const unpublished = await POST(request(), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(unpublished.status).toBe(404);
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });
});
