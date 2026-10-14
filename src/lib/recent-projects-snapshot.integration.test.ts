import { Prisma } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("./session", () => ({ getSession: async () => null }));
vi.mock("./auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("./storage", () => ({ publicAssetUrl: (value: string) => value }));
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { GET } = await import("../../app/api/projects/route");
const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

databaseDescribe("recent project listing snapshot", () => {
  afterAll(() => prisma.$disconnect());

  it.each(["delete", "private", "filter"] as const)("keeps a full page and cursor when a ranked project changes: %s", async (change) => {
    const suffix = crypto.randomUUID();
    const owner = await prisma.user.create({ data: { id: suffix, name: "Snapshot owner", email: `${suffix}@example.test` } });
    const originalQuery = prisma.$queryRaw;
    const originalTransaction = prisma.$transaction;
    try {
      const projects = await Promise.all([0, 1, 2, 3].map((index) => prisma.project.create({ data: {
        slug: `snapshot-${suffix}-${index}`, title: `Snapshot ${suffix}`, description: "", license: "MIT",
        coverUrl: "cover", ownerId: owner.id, isPublic: true, updatedAt: new Date(Date.UTC(2026, 0, 4 - index)),
      } })));
      let changed = false;
      const afterRank = async (client: Pick<Prisma.TransactionClient, "$queryRaw">, sql: Prisma.Sql) => {
        const rows = await originalQuery.call(client, sql);
        if (!changed && sql.sql.includes("WITH eligible")) {
          changed = true;
          if (change === "delete") await prisma.project.delete({ where: { id: projects[0].id } });
          else await prisma.project.update({ where: { id: projects[0].id }, data: change === "private" ? { isPublic: false } : { title: "No longer matches" } });
        }
        return rows;
      };
      prisma.$queryRaw = ((sql: Prisma.Sql) => afterRank(prisma, sql)) as typeof prisma.$queryRaw;
      prisma.$transaction = ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { isolationLevel?: Prisma.TransactionIsolationLevel }) => originalTransaction.call(prisma, (tx: Prisma.TransactionClient) => callback(new Proxy(tx, {
        get(target, key) {
          if (key === "$queryRaw") return (sql: Prisma.Sql) => afterRank(target, sql);
          return Reflect.get(target, key);
        },
      })), options)) as typeof prisma.$transaction;
      const url = `http://localhost/api/projects?sort=recent&limit=2&q=${suffix}`;
      const response = await GET(new Request(url));
      const page = await response.json();
      expect(changed).toBe(true);
      expect(page.items.map((row: { slug: string }) => row.slug)).toEqual(projects.slice(0, 2).map((row) => row.slug));
      expect(page.items[0]).toMatchObject({ isPublic: true, title: `Snapshot ${suffix}` });
      expect(page.nextCursor).toBe(projects[1].slug);
      prisma.$queryRaw = originalQuery;
      prisma.$transaction = originalTransaction;
      const next = await (await GET(new Request(`${url}&cursor=${page.nextCursor}`))).json();
      expect(next.items.map((row: { slug: string }) => row.slug)).toEqual(projects.slice(2).map((row) => row.slug));
      expect(next.nextCursor).toBeNull();
      const fresh = await (await GET(new Request(url))).json();
      expect(fresh.items.map((row: { slug: string }) => row.slug)).toEqual(projects.slice(1, 3).map((row) => row.slug));
    } finally {
      prisma.$queryRaw = originalQuery;
      prisma.$transaction = originalTransaction;
      await prisma.user.delete({ where: { id: owner.id } });
    }
  });
});
