import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revisions: [] as Row[], releases: [] as Row[], revisionFindMany: vi.fn(), releaseFindMany: vi.fn() }));
type Row = {
  id: string;
  createdAt: Date;
  number: number;
  title: string;
  changeDescription?: string;
  description?: string;
  isPublished?: boolean;
  publishedBy: { name: string } | null;
  project: { slug: string; title: string; isPublic: boolean };
};
type Query = {
  where: { isPublished?: boolean; project: { isPublic: boolean }; OR?: Array<{ createdAt: Date | { lt: Date }; id?: { lt: string } }> };
  take: number;
};

vi.mock("@/src/lib/prisma", () => ({ prisma: { revision: { findMany: mocks.revisionFindMany }, release: { findMany: mocks.releaseFindMany } } }));
const { getFeedPage, parseFeedCursor } = await import("./feed");

function row(id: string, time: string, isPublic = true, isPublished = true): Row {
  return { id, createdAt: new Date(time), number: Number(id.slice(1)) || 1, title: id, changeDescription: `Change ${id}`, description: `Release ${id}`, isPublished,
    publishedBy: { name: "Publisher" }, project: { slug: id, title: `Project ${id}`, isPublic } };
}

function find(rows: Row[], query: Query) {
  return rows.filter((item) => item.project.isPublic === query.where.project.isPublic &&
    (query.where.isPublished === undefined || item.isPublished === query.where.isPublished) &&
    (!query.where.OR || query.where.OR.some((part) => {
      if (part.createdAt instanceof Date) return item.createdAt.getTime() === part.createdAt.getTime() && (!part.id || item.id < part.id.lt);
      return item.createdAt < part.createdAt.lt;
    })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
    .slice(0, query.take);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revisions = [];
  mocks.releases = [];
  mocks.revisionFindMany.mockImplementation((query: Query) => find(mocks.revisions, query));
  mocks.releaseFindMany.mockImplementation((query: Query) => find(mocks.releases, query));
});

describe("global change feed", () => {
  it("shows only published revisions and public project releases", async () => {
    mocks.revisions = [row("r1", "2026-09-25T10:00:00.000Z"), row("r2", "2026-09-25T11:00:00.000Z", false), row("r3", "2026-09-25T12:00:00.000Z", true, false)];
    mocks.releases = [row("l1", "2026-09-25T09:00:00.000Z"), row("l2", "2026-09-25T13:00:00.000Z", false)];
    const page = await getFeedPage(null);
    expect(page.items.map(({ id }) => id)).toEqual(["r1", "l1"]);
    expect(mocks.revisionFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublished: true, project: { isPublic: true } }, take: 25 }));
    expect(mocks.releaseFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { project: { isPublic: true } }, take: 25 }));
  });

  it("paginates the merged order without loss at equal timestamps or after a new insertion", async () => {
    const same = "2026-09-25T10:00:00.000Z";
    mocks.revisions = Array.from({ length: 14 }, (_, i) => row(`r${String(i + 1).padStart(2, "0")}`, same));
    mocks.releases = Array.from({ length: 14 }, (_, i) => row(`l${String(i + 1).padStart(2, "0")}`, same));
    mocks.revisions.push(row("r00", "2026-09-24T10:00:00.000Z"));
    const first = await getFeedPage(null);
    expect(first.items).toHaveLength(24);
    expect(first.items.slice(0, 14).every((item) => item.type === "RELEASE")).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    mocks.releases.push(row("l99", "2026-09-26T10:00:00.000Z"));
    const second = await getFeedPage(parseFeedCursor(first.nextCursor!));
    const ids = [...first.items, ...second.items].map((item) => `${item.type}:${item.id}`);
    expect(ids).toHaveLength(29);
    expect(new Set(ids).size).toBe(29);
    expect(ids).not.toContain("RELEASE:l99");
    expect(second.nextCursor).toBeNull();
    expect(second.items.at(-1)?.id).toBe("r00");
  });

  it("rejects malformed cursors", () => {
    expect(() => parseFeedCursor("broken")).toThrow("Invalid feed cursor");
    expect(() => parseFeedCursor(Buffer.from(JSON.stringify({ createdAt: "bad", type: "RELEASE", id: "1" })).toString("base64url"))).toThrow("Invalid feed cursor");
  });
});
