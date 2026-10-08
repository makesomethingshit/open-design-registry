import { afterAll, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

const { prisma } = await import("./prisma");
const { createProjectRelease } = await import("./release-handlers");
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

function request(slug: string, body: unknown) {
  return new Request(`http://localhost/api/projects/${slug}/releases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

databaseDescribe("release idempotency in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("creates one release and one notification for concurrent identical requests, then replays after response loss", async () => {
    const suffix = crypto.randomUUID();
    const owner = await prisma.user.create({ data: { id: `release-owner-${suffix}`, name: "Release owner", email: `release-owner-${suffix}@example.test` } });
    const watcher = await prisma.user.create({ data: { id: `release-watcher-${suffix}`, name: "Release watcher", email: `release-watcher-${suffix}@example.test` } });
    const project = await prisma.project.create({ data: { slug: `release-idempotency-${suffix}`, title: "Release idempotency", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id } });
    const revisions = await Promise.all([1, 2].map((number) => prisma.revision.create({ data: { projectId: project.id, number, title: `Revision ${number}`, changeDescription: `Change ${number}`, sourceUrl: `https://example.test/${suffix}/${number}.zip` } })));
    await prisma.projectWatch.create({ data: { projectId: project.id, userId: watcher.id } });
    mocks.getSession.mockResolvedValue({ user: { id: owner.id } });
    const body = { title: "Release one", description: "A focused change.", revisionIds: revisions.map(({ id }) => id), requestId: crypto.randomUUID() };

    try {
      const responses = await Promise.all([
        createProjectRelease(request(project.slug, body), { slug: project.slug }),
        createProjectRelease(request(project.slug, body), { slug: project.slug }),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      const payloads = await Promise.all(responses.map((response) => response.json()));
      expect(payloads[0]).toEqual(payloads[1]);
      const releaseId = payloads[0].id as string;
      expect(await prisma.release.count({ where: { projectId: project.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { releaseId } })).toBe(1);

      const replay = await createProjectRelease(request(project.slug, body), { slug: project.slug });
      expect(replay.status).toBe(200);
      expect(await replay.json()).toEqual(payloads[0]);
      expect(await prisma.release.count({ where: { projectId: project.id } })).toBe(1);
      expect(await prisma.notification.count({ where: { releaseId } })).toBe(1);

      const changed = await createProjectRelease(request(project.slug, { ...body, title: "Changed intent" }), { slug: project.slug });
      expect(changed.status).toBe(409);
      expect(await prisma.release.count({ where: { projectId: project.id } })).toBe(1);

      const newIntent = await createProjectRelease(request(project.slug, { ...body, requestId: crypto.randomUUID() }), { slug: project.slug });
      expect(newIntent.status).toBe(201);
      expect(await prisma.release.count({ where: { projectId: project.id } })).toBe(2);
      expect(await prisma.notification.count({ where: { projectId: project.id } })).toBe(2);
    } finally {
      await prisma.releaseRevision.deleteMany({ where: { release: { projectId: project.id } } });
      await prisma.notification.deleteMany({ where: { projectId: project.id } });
      await prisma.projectWatch.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, watcher.id] } } });
    }
  });
});
