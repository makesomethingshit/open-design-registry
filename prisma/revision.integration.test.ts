import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required in CI");
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("Revision PostgreSQL constraints", () => {
  const prisma = new PrismaClient();
  const userId = `revision-test-user-${crypto.randomUUID()}`;
  const projectId = `revision-test-project-${crypto.randomUUID()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, name: "Revision test", email: `${userId}@example.test` } });
    await prisma.project.create({ data: { id: projectId, slug: projectId, title: "Revision test", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: userId } });
  });

  afterAll(() => prisma.$disconnect());

  it("serializes concurrent publishes and rejects both-null/both-present sources", async () => {
    const publish = (number: number) => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const latest = await tx.revision.findFirst({ where: { projectId }, orderBy: { number: "desc" } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return tx.revision.create({ data: { id: `revision-test-${crypto.randomUUID()}`, projectId, number: (latest?.number ?? 0) + 1, parentId: latest?.id, title: `Revision ${number}`, changeDescription: `Publish ${number}`, ...(number === 1 ? { sourceKey: "revisions/test/source-a" } : { sourceUrl: "https://example.test/source-b.zip" }) } });
    });

    const [first, second] = await Promise.all([publish(1), publish(2)]);
    expect([first.number, second.number].sort()).toEqual([1, 2]);
    const revisions = await prisma.revision.findMany({ where: { projectId }, orderBy: { number: "asc" } });
    expect(revisions).toHaveLength(2);
    expect(revisions[0].parentId).toBeNull();
    expect(revisions[1].parentId).toBe(revisions[0].id);

    await expect(prisma.$executeRaw`INSERT INTO "Revision" ("id", "projectId", "number", "title", "changeDescription", "sourceKey", "sourceUrl") VALUES (${`revision-test-${crypto.randomUUID()}`}, ${projectId}, 99, 'Invalid', 'Invalid', 'both-key', 'https://example.test/both')`).rejects.toThrow();
    await expect(prisma.$executeRaw`INSERT INTO "Revision" ("id", "projectId", "number", "title", "changeDescription") VALUES (${`revision-test-${crypto.randomUUID()}`}, ${projectId}, 100, 'Invalid', 'Invalid')`).rejects.toThrow();
    await expect(prisma.$executeRaw`INSERT INTO "Revision" ("id", "projectId", "number", "title", "changeDescription", "sourceUrl") VALUES (${`revision-test-${crypto.randomUUID()}`}, ${projectId}, 101, '', 'Invalid', 'https://example.test/empty-title')`).rejects.toThrow();
    await expect(prisma.$executeRaw`INSERT INTO "Preview" ("id", "revisionId", "position", "key", "url", "mimeType", "size", "altText") VALUES (${`preview-test-${crypto.randomUUID()}`}, ${revisions[0].id}, 99, ${`preview-test-${crypto.randomUUID()}`}, 'https://example.test/preview.png', 'image/png', 1, '')`).rejects.toThrow();
  });

  it("allows preview inserts only until the atomic publish transition", async () => {
    const revision = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const latest = await tx.revision.findFirst({ where: { projectId }, orderBy: { number: "desc" } });
      const staged = await tx.revision.create({
        data: {
          id: `revision-test-${crypto.randomUUID()}`,
          projectId,
          number: (latest?.number ?? 0) + 1,
          parentId: latest?.id,
          title: "Atomic publish",
          changeDescription: "Insert previews before publishing",
          sourceUrl: "https://example.test/atomic.zip",
          isPublished: false,
        },
      });
      await tx.preview.create({
        data: {
          id: `preview-test-${crypto.randomUUID()}`,
          revisionId: staged.id,
          position: 0,
          key: `preview-test-${crypto.randomUUID()}`,
          url: "https://example.test/atomic.png",
          mimeType: "image/png",
          size: 1,
          altText: "Atomic preview",
        },
      });
      return tx.revision.update({ where: { id: staged.id }, data: { isPublished: true }, include: { previews: true } });
    });

    expect(revision.isPublished).toBe(true);
    expect(revision.previews).toHaveLength(1);
    await expect(prisma.$executeRaw`INSERT INTO "Preview" ("id", "revisionId", "position", "key", "url", "mimeType", "size", "altText") VALUES (${`preview-test-${crypto.randomUUID()}`}, ${revision.id}, 1, ${`preview-test-${crypto.randomUUID()}`}, 'https://example.test/late.png', 'image/png', 1, 'Late preview')`).rejects.toThrow();
  });
});
