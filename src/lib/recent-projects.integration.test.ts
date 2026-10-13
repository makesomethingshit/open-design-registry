import { afterAll, describe, expect, it } from "vitest";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { recentProjectSlugs } = await import("./recent-projects");
const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

databaseDescribe("recent project activity in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());
  it("sorts metadata, published revisions and releases; ignores drafts, paginates and protects private rows", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const owner = await prisma.user.create({ data: { id: `recent-owner-${suffix}`, name: "Activity owner", email: `recent-${suffix}@example.test` } });
    const d = (value: string) => new Date(value);
    const ancient = d("2026-01-01T00:00:00Z");
    const projects = await Promise.all(["alpha", "beta", "gamma", "private"].map((name) => prisma.project.create({ data: { slug: `recent-${name}-${suffix}`, title: `Activity ${name} ${suffix}`, description: "Design tools", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id, isPublic: name !== "private", createdAt: ancient, updatedAt: ancient } })));
    const [alpha, beta, gamma, hidden] = projects;
    await prisma.revision.create({ data: { projectId: alpha.id, number: 1, title: "Published revision", changeDescription: "Published", sourceUrl: `https://example.test/${suffix}/alpha.zip`, tool: "penpot", tags: ["ui"], createdAt: d("2026-04-01T00:00:00Z") } });
    await prisma.revision.create({ data: { projectId: beta.id, number: 1, title: "Unpublished", changeDescription: "Draft", sourceUrl: `https://example.test/${suffix}/beta.zip`, isPublished: false, createdAt: d("2026-09-01T00:00:00Z") } });
    await prisma.release.create({ data: { projectId: beta.id, number: 1, title: "Public release", createdAt: d("2026-05-01T00:00:00Z") } });
    await prisma.project.update({ where: { id: gamma.id }, data: { updatedAt: d("2026-03-01T00:00:00Z") } });
    await prisma.release.create({ data: { projectId: hidden.id, number: 1, title: "Secret release", createdAt: d("2026-10-01T00:00:00Z") } });
    const opts = { viewerId: null, query: suffix, license: "MIT", tool: "", tags: [] as string[], limit: 10 };
    const all = await recentProjectSlugs(opts);
    expect(all.filter((slug) => slug.endsWith(suffix))).toEqual([beta.slug, alpha.slug, gamma.slug]);
    const first = await recentProjectSlugs({ ...opts, limit: 2 });
    const second = await recentProjectSlugs({ ...opts, cursor: first.at(-1), limit: 2 });
    expect([...first, ...second].filter((slug) => slug.endsWith(suffix))).toEqual([beta.slug, alpha.slug, gamma.slug]);
    expect((await recentProjectSlugs({ ...opts, viewerId: owner.id })).filter((slug) => slug.endsWith(suffix))).toEqual([hidden.slug, beta.slug, alpha.slug, gamma.slug]);
    expect((await recentProjectSlugs({ ...opts, tool: "penpot", tags: ["ui"] })).filter((slug) => slug.endsWith(suffix))).toEqual([alpha.slug]);
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: alpha.id }, select: { updatedAt: true } });
    expect(stored.updatedAt).toEqual(ancient);
  });
});
