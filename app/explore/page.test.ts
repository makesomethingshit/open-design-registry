import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ projectFindMany: vi.fn(), raw: vi.fn(), transaction: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.projectFindMany }, $queryRaw: mocks.raw, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { default: ExplorePage } = await import("./page");

describe("Explore project sorting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback({ project: { findMany: mocks.projectFindMany }, $queryRaw: mocks.raw }));
    mocks.projectFindMany.mockResolvedValue([]);
    mocks.raw.mockResolvedValue([{ slug: "demo" }]);
  });

  it("renders the ranked publication date in recent cards and metadata date in newest cards", async () => {
    const updatedAt = new Date("2026-01-01T00:00:00Z");
    const activityAt = new Date("2026-05-01T00:00:00Z");
    mocks.raw.mockResolvedValue([{ slug: "demo", activityAt }]);
    mocks.projectFindMany.mockResolvedValue([{ id: "demo", slug: "demo", title: "Demo", description: "", license: "MIT", coverUrl: "", owner: { name: "Designer" }, revisions: [], updatedAt }]);
    for (const sort of ["recent", ""]) {
      const page = await ExplorePage({ searchParams: Promise.resolve({ sort }) });
      const suspense = page.props.children.props.children.find((child: { props?: { children?: { props?: { projects?: unknown } } } }) => child?.props?.children?.props?.projects);
      const results = suspense.props.children;
      const markup = renderToStaticMarkup(await results.type(results.props));
      expect(markup).toContain(`dateTime="${(sort ? activityAt : updatedAt).toISOString()}"`);
    }
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });

  it("ranks by published Revision/Release activity in SQL, preserving public filters", async () => {
    await ExplorePage({ searchParams: Promise.resolve({ q: "kit", license: "MIT", sort: "recent", tool: "Penpot", tag: "UI" }) });
    const sql = mocks.raw.mock.calls[0][0];
    expect(sql.sql).toContain('rv."isPublished" = true');
    expect(sql.sql).toContain('"Release" AS rel');
    expect(sql.values).toEqual(expect.arrayContaining(["kit", "MIT", "penpot", ["ui"]].filter((x) => x !== "kit")));
    await vi.waitFor(() => expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublic: true, slug: { in: ["demo"] } } })));
  });
});
