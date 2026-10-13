import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ projectFindMany: vi.fn(), raw: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.projectFindMany }, $queryRaw: mocks.raw } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { default: ExplorePage } = await import("./page");

describe("Explore project sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindMany.mockResolvedValue([]);
    mocks.raw.mockResolvedValue([{ slug: "demo" }]);
  });

  it("ranks by published Revision/Release activity in SQL, preserving public filters", async () => {
    await ExplorePage({ searchParams: Promise.resolve({ q: "kit", license: "MIT", sort: "recent", tool: "Penpot", tag: "UI" }) });
    const sql = mocks.raw.mock.calls[0][0];
    expect(sql.sql).toContain('rv."isPublished" = true');
    expect(sql.sql).toContain('"Release" AS rel');
    expect(sql.values).toEqual(expect.arrayContaining(["kit", "MIT", "penpot", ["ui"]].filter((x) => x !== "kit")));
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublic: true, slug: { in: ["demo"] } } }));
  });
});
