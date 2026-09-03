import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ projectFindMany: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.projectFindMany } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { default: HomePage } = await import("./page");

describe("home project sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindMany.mockResolvedValue([]);
  });

  it("uses updatedAt for recent sorting while keeping filters", async () => {
    await HomePage({ searchParams: Promise.resolve({ q: "kit", license: "MIT", sort: "recent" }) });
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isPublic: true,
        OR: [{ title: { contains: "kit", mode: "insensitive" } }, { description: { contains: "kit", mode: "insensitive" } }],
        license: "MIT",
      },
      orderBy: { updatedAt: "desc" },
    }));
  });
});
