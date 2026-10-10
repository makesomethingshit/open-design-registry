import { afterAll, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required in CI");
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

const { prisma } = await import("@/src/lib/prisma");
const { PUT: putWatch, DELETE: deleteWatch } = await import("./watch/route");
const { PUT: putStar, DELETE: deleteStar } = await import("./star/route");
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;

function request(slug: string, method: "PUT" | "DELETE") {
  return new Request(`http://localhost/api/projects/${slug}/relationship`, { method });
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function result(response: Response) {
  return { status: response.status, body: await response.json() };
}

databaseDescribe("private project relationship removal in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("removes only the requester relationship after a private transition", async () => {
    const suffix = crypto.randomUUID();
    const owner = await prisma.user.create({ data: { id: `relationship-owner-${suffix}`, name: "Relationship owner", email: `relationship-owner-${suffix}@example.test` } });
    const requester = await prisma.user.create({ data: { id: `relationship-requester-${suffix}`, name: "Relationship requester", email: `relationship-requester-${suffix}@example.test` } });
    const other = await prisma.user.create({ data: { id: `relationship-other-${suffix}`, name: "Relationship other", email: `relationship-other-${suffix}@example.test` } });
    const slug = `relationship-146-${suffix}`;
    const project = await prisma.project.create({ data: { slug, title: "Relationship removal", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id } });

    try {
      mocks.getSession.mockResolvedValue(null);
      expect((await putWatch(request(slug, "PUT"), params(slug))).status).toBe(401);
      expect((await putStar(request(slug, "PUT"), params(slug))).status).toBe(401);

      mocks.getSession.mockResolvedValue({ user: { id: requester.id } });
      expect(await result(await putWatch(request(slug, "PUT"), params(slug)))).toEqual({ status: 200, body: { watched: true } });
      expect(await result(await putStar(request(slug, "PUT"), params(slug)))).toEqual({ status: 200, body: { starred: true } });
      await prisma.projectWatch.create({ data: { userId: other.id, projectId: project.id } });
      await prisma.projectStar.create({ data: { userId: other.id, projectId: project.id } });

      await prisma.project.update({ where: { id: project.id }, data: { isPublic: false } });
      expect((await putWatch(request(slug, "PUT"), params(slug))).status).toBe(404);
      expect((await putStar(request(slug, "PUT"), params(slug))).status).toBe(404);

      expect(await Promise.all([
        result(await deleteWatch(request(slug, "DELETE"), params(slug))),
        result(await deleteStar(request(slug, "DELETE"), params(slug))),
      ])).toEqual([
        { status: 200, body: { watched: false } },
        { status: 200, body: { starred: false } },
      ]);
      expect(await prisma.projectWatch.findUnique({ where: { userId_projectId: { userId: requester.id, projectId: project.id } } })).toBeNull();
      expect(await prisma.projectStar.findUnique({ where: { userId_projectId: { userId: requester.id, projectId: project.id } } })).toBeNull();
      expect(await prisma.projectWatch.findUnique({ where: { userId_projectId: { userId: other.id, projectId: project.id } } })).not.toBeNull();
      expect(await prisma.projectStar.findUnique({ where: { userId_projectId: { userId: other.id, projectId: project.id } } })).not.toBeNull();

      expect(await Promise.all([
        result(await deleteWatch(request(slug, "DELETE"), params(slug))),
        result(await deleteStar(request(slug, "DELETE"), params(slug))),
      ])).toEqual([
        { status: 200, body: { watched: false } },
        { status: 200, body: { starred: false } },
      ]);

      await prisma.project.update({ where: { id: project.id }, data: { isPublic: true } });
      expect(await Promise.all([
        result(await deleteWatch(request(slug, "DELETE"), params(slug))),
        result(await deleteStar(request(slug, "DELETE"), params(slug))),
        result(await deleteWatch(request(`missing-${suffix}`, "DELETE"), params(`missing-${suffix}`))),
        result(await deleteStar(request(`missing-${suffix}`, "DELETE"), params(`missing-${suffix}`))),
      ])).toEqual([
        { status: 200, body: { watched: false } },
        { status: 200, body: { starred: false } },
        { status: 200, body: { watched: false } },
        { status: 200, body: { starred: false } },
      ]);

      expect(await result(await putWatch(request(slug, "PUT"), params(slug)))).toEqual({ status: 200, body: { watched: true } });
      expect(await result(await putStar(request(slug, "PUT"), params(slug)))).toEqual({ status: 200, body: { starred: true } });
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, requester.id, other.id] } } });
    }
  });
});
