import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findMany: mocks.findMany } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));

const { GET } = await import("./route");

describe("revision discovery listing", () => {
  it("returns a bounded cursor page with metadata filters", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findMany.mockResolvedValue([
      {
        id: "revision-1", projectId: "project", number: 2, parentId: null, title: "Mobile kit", changeDescription: "Update", sourceKey: null, sourceUrl: "https://example.test/source.zip", tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: null, isPublished: true, createdAt: new Date("2026-01-01"), previews: [],
      },
      {
        id: "revision-2", projectId: "project", number: 1, parentId: null, title: "Older", changeDescription: "Initial", sourceKey: null, sourceUrl: "https://example.test/source.zip", tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: null, isPublished: true, createdAt: new Date("2025-01-01"), previews: [],
      },
    ]);

    const response = await GET(new Request("http://localhost/api/projects/demo/revisions?license=MIT&limit=1&tool=figma&tag=ui&sort=recent"), { params: Promise.resolve({ slug: "demo" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ id: "revision-1", tool: "figma", tags: ["ui"] }], nextCursor: "revision-1" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ projectId: "project", isPublished: true }, { license: "MIT" }, { tool: { equals: "figma" } }, { tags: { hasEvery: ["ui"] } }] },
      take: 2,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
  });

  it("keeps the array response while honoring recent sorting without pagination", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findMany.mockClear();
    mocks.findMany.mockResolvedValue([
      {
        id: "revision-new", projectId: "project", number: 2, parentId: null, title: "Newer", changeDescription: "Update", sourceKey: null, sourceUrl: "https://example.test/source.zip", tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: null, isPublished: true, createdAt: new Date("2026-01-02"), previews: [],
      },
      {
        id: "revision-old", projectId: "project", number: 1, parentId: null, title: "Older", changeDescription: "Initial", sourceKey: null, sourceUrl: "https://example.test/source.zip", tool: "figma", toolVersion: "1", tags: ["ui"], sourceChecksum: null, isPublished: true, createdAt: new Date("2026-01-01"), previews: [],
      },
    ]);

    const response = await GET(new Request("http://localhost/api/projects/demo/revisions?sort=recent"), { params: Promise.resolve({ slug: "demo" }) });
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body.map((revision: { id: string }) => revision.id)).toEqual(["revision-new", "revision-old"]);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 25,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
  });
});
