import { describe, expect, it } from "vitest";
import { prisma } from "./prisma";

const runDatabaseContention = process.env.RUN_PROPOSAL_CONCURRENCY_TEST === "1" && Boolean(process.env.DATABASE_URL);
const databaseDescribe = runDatabaseContention ? describe : describe.skip;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

databaseDescribe("proposal transaction lock integration", () => {
  it("serializes two state writers on the shared Project row", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: `proposal-lock-${suffix}`, name: "Proposal lock test", email: `proposal-lock-${suffix}@example.test` } });
    const project = await prisma.project.create({ data: { slug: `proposal-lock-${suffix}`, title: "Proposal lock test", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: user.id } });
    const locked = deferred();
    const release = deferred();
    const order: string[] = [];
    try {
      const first = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
        locked.resolve();
        await release.promise;
        order.push("first");
      });
      await locked.promise;
      const second = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
        order.push("second");
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(order).toEqual([]);
      release.resolve();
      await Promise.all([first, second]);
      expect(order).toEqual(["first", "second"]);
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("serializes proposal issue validation against a concurrent close", async () => {
    // Mirrors createProjectProposal: lock the issue row FOR UPDATE and validate
    // OPEN inside the transaction. The close path (patchIssue) is a plain row
    // update with no explicit locks, so one side always waits for the other and
    // validation and create stay atomic with respect to a concurrent close.
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: `issue-lock-${suffix}`, name: "Issue lock test", email: `issue-lock-${suffix}@example.test` } });
    const project = await prisma.project.create({ data: { slug: `issue-lock-${suffix}`, title: "Issue lock test", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: user.id } });
    const issue = await prisma.issue.create({ data: { projectId: project.id, authorId: user.id, title: "Issue lock test" } });
    const rowLocked = deferred();
    const release = deferred();
    let closeFinished = false;
    try {
      const reader = prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Issue" WHERE id = ${issue.id} AND "projectId" = ${project.id} AND status = 'OPEN' FOR UPDATE`;
        expect(rows).toHaveLength(1);
        rowLocked.resolve();
        await release.promise;
      });
      // Wait until the reader holds the issue row lock, then close the issue
      // the same way patchIssue does (plain update, no explicit locks).
      await rowLocked.promise;
      const closer = prisma.issue
        .update({ where: { id: issue.id }, data: { status: "CLOSED", closedAt: new Date(), closedBy: user.id } })
        .then((result) => {
          closeFinished = true;
          return result;
        });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(closeFinished).toBe(false);
      release.resolve();
      await Promise.all([reader, closer]);
      expect(closeFinished).toBe(true);
      const finalIssue = await prisma.issue.findUnique({ where: { id: issue.id }, select: { status: true } });
      expect(finalIssue?.status).toBe("CLOSED");
    } finally {
      await prisma.issue.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
