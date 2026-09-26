import { prisma } from "@/src/lib/prisma";

const pageSize = 24;
type EventType = "REVISION" | "RELEASE";
type Cursor = { createdAt: Date; type: EventType; id: string };
const typeOrder: Record<EventType, number> = { REVISION: 0, RELEASE: 1 };

export type FeedItem = Cursor & {
  number: number;
  title: string;
  description: string;
  publisher: string | null;
  project: { slug: string; title: string };
};

export function parseFeedCursor(value?: string): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 512 || Buffer.from(value, "base64url").toString("base64url") !== value) throw new Error();
    const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(data.createdAt);
    if (typeof data.createdAt !== "string" || !Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== data.createdAt ||
      (data.type !== "REVISION" && data.type !== "RELEASE") || typeof data.id !== "string" || !data.id || data.id.length > 128) throw new Error();
    return { createdAt, type: data.type, id: data.id };
  } catch {
    throw new Error("Invalid feed cursor");
  }
}

function after(cursor: Cursor | null, type: EventType) {
  if (!cursor) return {};
  return { OR: [
    { createdAt: { lt: cursor.createdAt } },
    ...(typeOrder[type] < typeOrder[cursor.type] ? [{ createdAt: cursor.createdAt }] : []),
    ...(type === cursor.type ? [{ createdAt: cursor.createdAt, id: { lt: cursor.id } }] : []),
  ] };
}

function newerFirst(a: FeedItem, b: FeedItem) {
  return b.createdAt.getTime() - a.createdAt.getTime() || typeOrder[b.type] - typeOrder[a.type] || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export async function getFeedPage(cursor: Cursor | null) {
  const [revisions, releases] = await Promise.all([
    prisma.revision.findMany({
      where: { isPublished: true, project: { isPublic: true }, ...after(cursor, "REVISION") },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: { id: true, createdAt: true, number: true, title: true, changeDescription: true, publishedBy: { select: { name: true } }, project: { select: { slug: true, title: true } } },
    }),
    prisma.release.findMany({
      where: { project: { isPublic: true }, ...after(cursor, "RELEASE") },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: { id: true, createdAt: true, number: true, title: true, description: true, publishedBy: { select: { name: true } }, project: { select: { slug: true, title: true } } },
    }),
  ]);
  const merged: FeedItem[] = [
    ...revisions.map(({ changeDescription, publishedBy, ...revision }) => ({ ...revision, type: "REVISION" as const, description: changeDescription, publisher: publishedBy?.name ?? null })),
    ...releases.map(({ publishedBy, ...release }) => ({ ...release, type: "RELEASE" as const, publisher: publishedBy?.name ?? null })),
  ].sort(newerFirst);
  const items = merged.slice(0, pageSize);
  const last = items.at(-1);
  const nextCursor = merged.length > pageSize && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), type: last.type, id: last.id })).toString("base64url")
    : null;
  return { items, nextCursor };
}
