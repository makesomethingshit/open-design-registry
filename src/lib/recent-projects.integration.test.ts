import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
if (process.env.TEST_DATABASE_URL) {
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", "-c statement_timeout=3000");
  process.env.DATABASE_URL = url.toString();
}
const { prisma } = await import("./prisma");
const { recentProjectActivity } = await import("./recent-projects");
const recentProjectSlugs = async (options: Parameters<typeof recentProjectActivity>[0]) => (await recentProjectActivity(options)).map((row) => row.slug);
const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

databaseDescribe("recent project activity in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());
  it("sorts metadata, published revisions and releases; ignores drafts, paginates and protects private rows", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const owner = await prisma.user.create({ data: { id: `recent-owner-${suffix}`, name: "Activity owner", email: `recent-${suffix}@example.test` } });
    try {
      const d = (value: string) => new Date(value);
      const ancient = d("2026-01-01T00:00:00Z");
      const projects = await Promise.all(["alpha", "beta", "gamma", "private", "empty", "tie-a", "tie-z"].map((name) => prisma.project.create({ data: { slug: `recent-${name}-${suffix}`, title: `Activity ${name} ${suffix}`, description: "Design tools", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id, isPublic: name !== "private", createdAt: ancient, updatedAt: ancient } })));
      const [alpha, beta, gamma, hidden, empty, tieA, tieZ] = projects;
      await prisma.revision.create({ data: { projectId: alpha.id, number: 2, title: "Historical publication", changeDescription: "Historical", sourceUrl: `https://example.test/${suffix}/historical.zip`, createdAt: d("2026-02-01T00:00:00Z") } });
      await prisma.revision.create({ data: { projectId: alpha.id, number: 1, title: "Published revision", changeDescription: "Published", sourceUrl: `https://example.test/${suffix}/alpha.zip`, tool: "penpot", tags: ["ui"], createdAt: d("2026-04-01T00:00:00Z") } });
      await prisma.revision.create({ data: { projectId: beta.id, number: 1, title: "Unpublished", changeDescription: "Draft", sourceUrl: `https://example.test/${suffix}/beta.zip`, isPublished: false, createdAt: d("2026-09-01T00:00:00Z") } });
      await prisma.release.create({ data: { projectId: beta.id, number: 1, title: "Public release", createdAt: d("2026-05-01T00:00:00Z") } });
      await prisma.project.update({ where: { id: gamma.id }, data: { updatedAt: d("2026-03-01T00:00:00Z") } });
      await prisma.release.create({ data: { projectId: hidden.id, number: 1, title: "Secret release", createdAt: d("2026-10-01T00:00:00Z") } });
      await prisma.discussion.create({ data: { projectId: empty.id, title: "Excluded discussion", body: "No ranking change", authorId: owner.id } });
      const timestamps = () => Promise.all([
        prisma.project.findMany({ where: { ownerId: owner.id }, orderBy: { slug: "asc" }, select: { id: true, updatedAt: true } }),
        prisma.revision.findMany({ where: { project: { ownerId: owner.id } }, orderBy: { id: "asc" }, select: { id: true, createdAt: true } }),
        prisma.release.findMany({ where: { project: { ownerId: owner.id } }, orderBy: { id: "asc" }, select: { id: true, createdAt: true } }),
      ]);
      const before = await timestamps();
      const opts = { viewerId: null, query: suffix, license: "MIT", tool: "", tags: [] as string[], limit: 10 };
      const expected = [beta.slug, alpha.slug, gamma.slug, tieZ.slug, tieA.slug, empty.slug];
      const all = await recentProjectSlugs(opts);
      expect(all).toEqual(expected);
      expect(await recentProjectActivity(opts)).toEqual([
        { slug: beta.slug, activityAt: d("2026-05-01T00:00:00Z") },
        { slug: alpha.slug, activityAt: d("2026-04-01T00:00:00Z") },
        { slug: gamma.slug, activityAt: d("2026-03-01T00:00:00Z") },
        ...[tieZ, tieA, empty].map((project) => ({ slug: project.slug, activityAt: ancient })),
      ]);
      const visited: string[] = [];
      for (let cursor: string | undefined; ; ) {
        const page = await recentProjectSlugs({ ...opts, cursor, limit: 2 });
        if (!page.length) break;
        visited.push(...page);
        cursor = page.at(-1);
        expect(visited.length).toBeLessThanOrEqual(expected.length);
      }
      expect(visited).toEqual(expected);
      expect(await recentProjectSlugs({ ...opts, viewerId: owner.id })).toEqual([hidden.slug, ...expected]);
      expect(await recentProjectSlugs({ ...opts, viewerId: "unrelated-user" })).toEqual(expected);
      expect(await recentProjectSlugs({ ...opts, tool: "penpot", tags: ["ui"] })).toEqual([alpha.slug]);
      expect(await recentProjectSlugs({ ...opts, tool: "penpot", tags: ["missing"] })).toEqual([]);
      expect(await recentProjectSlugs({ ...opts, license: "CC0 1.0" })).toEqual([]);
      for (const cursor of ["missing", hidden.slug, beta.slug]) {
        expect(await recentProjectSlugs({ ...opts, tool: "penpot", cursor })).toEqual([]);
      }
      const stored = await prisma.project.findUniqueOrThrow({ where: { id: alpha.id }, select: { updatedAt: true } });
      expect(stored.updatedAt).toEqual(ancient);
      expect(await timestamps()).toEqual(before);
    } finally {
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });

  it("ranks 1,000 Projects / 10,000 Revisions / 1,000 Releases within a 3-second PostgreSQL statement timeout", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const owner = await prisma.user.create({ data: { id: `benchmark-${suffix}`, name: "Benchmark owner", email: `benchmark-${suffix}@example.test` } });
    try {
      const ancient = new Date("2026-01-01T00:00:00Z");
      const projects = Array.from({ length: 1000 }, (_, index) => ({ id: `bench-${suffix}-${index}`, slug: `bench-${suffix}-${String(index).padStart(4, "0")}`, title: `Benchmark ${suffix}`, description: "Read-only ranking fixture", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id, createdAt: ancient, updatedAt: ancient }));
      await prisma.project.createMany({ data: projects });
      await prisma.revision.createMany({ data: projects.flatMap((project, index) => Array.from({ length: 10 }, (_, number) => ({ projectId: project.id, number: number + 1, title: "Publication", changeDescription: "Fixture", sourceUrl: `https://example.test/${suffix}/${index}/${number}.zip`, isPublished: number < 9, createdAt: new Date(ancient.getTime() + (number === 9 ? 100000 : index * 10 + number) * 1000) }))) });
      await prisma.release.createMany({ data: projects.map((project, index) => ({ projectId: project.id, number: 1, title: "Release", createdAt: new Date(ancient.getTime() + (index * 10 + 9) * 1000) })) });
      expect(await prisma.$queryRaw`SHOW statement_timeout`).toEqual([{ statement_timeout: "3s" }]);
      const opts = { viewerId: null, query: suffix, license: "MIT", tool: "", tags: [] as string[], limit: 24 };
      const expected = projects.map((project) => project.slug).reverse();
      for (const cursor of [undefined, expected[23]]) {
        const originalQuery = prisma.$queryRaw;
        const queries: Prisma.Sql[] = [];
        prisma.$queryRaw = ((sql: Prisma.Sql) => {
          queries.push(sql);
          return originalQuery.call(prisma, sql);
        }) as typeof prisma.$queryRaw;
        const started = performance.now();
        try {
          expect(await recentProjectSlugs({ ...opts, cursor })).toEqual(expected.slice(cursor ? 24 : 0, cursor ? 48 : 24));
          expect(queries).toHaveLength(1);
        } finally {
          prisma.$queryRaw = originalQuery;
        }
        const elapsed = performance.now() - started;
        expect(elapsed).toBeLessThan(3000);
        const plan = await prisma.$queryRaw<Array<{ "QUERY PLAN": Array<{ "Execution Time": number }> }>>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queries[0]}`);
        console.info(`recent benchmark ${cursor ? "cursor" : "first"}: ${elapsed.toFixed(1)}ms; EXPLAIN execution ${plan[0]["QUERY PLAN"][0]["Execution Time"]}ms`);
      }
    } finally {
      await prisma.user.delete({ where: { id: owner.id } });
    }
  }, 30_000);
});
