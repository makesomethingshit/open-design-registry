import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ projectFindMany: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.projectFindMany } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { default: ExplorePage } = await import("./page");

describe("Explore project sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindMany.mockResolvedValue([]);
  });

  it("uses updatedAt for recent sorting while keeping every public filter", async () => {
    await ExplorePage({ searchParams: Promise.resolve({ q: "kit", license: "MIT", sort: "recent", tool: "Penpot", tag: "UI" }) });
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isPublic: true,
        OR: [{ title: { contains: "kit", mode: "insensitive" } }, { description: { contains: "kit", mode: "insensitive" } }],
        license: "MIT",
        revisions: { some: { tool: { equals: "penpot" }, tags: { hasEvery: ["ui"] } } },
      },
      orderBy: { updatedAt: "desc" },
    }));
  });
});
