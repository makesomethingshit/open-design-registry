import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findMany: vi.fn() }));

vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.findMany } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));

const { GET } = await import("./route");

describe("project discovery listing", () => {
  it("filters by tool and tag and returns the next cursor", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([
      { slug: "second", title: "Second", description: "", license: "MIT", isPublic: true, coverUrl: "covers/second", createdAt: new Date("2026-01-02"), owner: { name: "Author" } },
      { slug: "first", title: "First", description: "", license: "MIT", isPublic: true, coverUrl: "covers/first", createdAt: new Date("2026-01-01"), owner: { name: "Author" } },
    ]);

    const response = await GET(new Request("http://localhost/api/projects?limit=1&tool=Figma&tag=UI"));

    expect(await response.json()).toMatchObject({ items: [{ slug: "second" }], nextCursor: "second" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ isPublic: true }, { revisions: { some: { tool: { equals: "Figma", mode: "insensitive" } } } }, { revisions: { some: { tags: { has: "ui" } } } }] },
      take: 2,
      orderBy: [{ createdAt: "desc" }, { slug: "desc" }],
    }));
  });
});
