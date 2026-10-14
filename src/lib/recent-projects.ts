import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Read-only activity rank. Does not rewrite Project.updatedAt or publication records. */
export async function recentProjectActivity({ viewerId, query, license, tool, tags, cursor, limit }: { viewerId: string | null; query: string; license: string; tool: string; tags: string[]; cursor?: string | null; limit: number }, db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma) {
  const filters: Prisma.Sql[] = [
    viewerId ? Prisma.sql`(p."isPublic" = true OR p."ownerId" = ${viewerId})` : Prisma.sql`p."isPublic" = true`,
  ];
  if (query) {
    const pattern = `%${query}%`;
    filters.push(Prisma.sql`(p."title" ILIKE ${pattern} OR p."description" ILIKE ${pattern})`);
  }
  if (license) filters.push(Prisma.sql`p."license" = ${license}`);
  if (tool || tags.length) {
    const revisionFilters: Prisma.Sql[] = [Prisma.sql`r."projectId" = p.id`];
    if (tool) revisionFilters.push(Prisma.sql`r."tool" = ${tool}`);
    if (tags.length) revisionFilters.push(Prisma.sql`r."tags" @> ${tags}::text[]`);
    filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "Revision" AS r WHERE ${Prisma.join(revisionFilters, " AND ")})`);
  }
  // The event timestamp of a legacy published Revision is its recorded createdAt.
  const activity = Prisma.sql`GREATEST(
    p."updatedAt",
    COALESCE((SELECT MAX(rv."createdAt") FROM "Revision" AS rv WHERE rv."projectId" = p.id AND rv."isPublished" = true), p."updatedAt"),
    COALESCE((SELECT MAX(rel."createdAt") FROM "Release" AS rel WHERE rel."projectId" = p.id), p."updatedAt")
  )`;
  const anchor = cursor
    ? Prisma.sql`JOIN eligible AS anchor ON anchor.slug = ${cursor} WHERE (e."activityAt", e.slug) < (anchor."activityAt", anchor.slug)`
    : Prisma.empty;
  return db.$queryRaw<Array<{ slug: string; activityAt: Date }>>(Prisma.sql`
    WITH eligible AS (
      SELECT p.slug, ${activity} AS "activityAt"
      FROM "Project" AS p WHERE ${Prisma.join(filters, " AND ")}
    )
    SELECT e.slug, e."activityAt" FROM eligible AS e
    ${anchor}
    ORDER BY e."activityAt" DESC, e.slug DESC
    LIMIT ${limit}
  `);
}
