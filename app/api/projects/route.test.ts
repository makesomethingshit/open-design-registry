import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  projectFindMany: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.projectFindMany } } }));
vi.mock("@/src/lib/storage", () => ({
  publicAssetUrl: (value: string) => `/api/assets?key=${encodeURIComponent(value)}`,
  deleteObject: vi.fn(),
  putCover: vi.fn(),
}));

const { GET } = await import("./route");

function request(query = "") {
  return new Request(`http://localhost/api/projects${query}`);
}

describe("project listing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.projectFindMany.mockResolvedValue([{ slug: "studio", title: "Studio kit", description: "Reusable components", license: "MIT", isPublic: true, coverUrl: "covers/studio", createdAt: new Date("2026-01-01"), owner: { name: "Author" } }]);
  });

  it("filters public projects by title/description and license", async () => {
    const response = await GET(request("?q=components&license=MIT"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ slug: "studio", coverUrl: "/api/assets?key=covers%2Fstudio" }]);
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { isPublic: true },
          { OR: [{ title: { contains: "components", mode: "insensitive" } }, { description: { contains: "components", mode: "insensitive" } }] },
          { license: "MIT" },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { slug: "desc" }],
    }));
  });

  it("keeps the existing public scope and newest-first order without filters", async () => {
    await GET(request());
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublic: true }, orderBy: [{ createdAt: "desc" }, { slug: "desc" }] }));
  });

  it("orders by recent activity when requested", async () => {
    await GET(request("?sort=recent"));
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ updatedAt: "desc" }, { slug: "desc" }] }));
  });
});
