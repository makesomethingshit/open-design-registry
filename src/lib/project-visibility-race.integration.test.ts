import { afterAll, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { postProjectDiscussion, postProjectDiscussionComment } = await import("./discussion-handlers");
const { postIssueComment } = await import("./issue-handlers");
const { POST: postIssue } = await import("@/app/api/projects/[slug]/issues/route");
const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;
function request(body: unknown) {
  return new Request("http://localhost/api/visibility-race", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function withRowLock<T>(table: "Issue" | "Project", id: string, run: (tx: Prisma.TransactionClient, holderPid: number, track: <R>(promise: Promise<R>) => Promise<R>) => Promise<T>) {
  const locked = deferred<{ tx: Prisma.TransactionClient; pid: number }>();
  const release = deferred<void>();
  const requests: Promise<unknown>[] = [];
  let lockError: unknown;
  const track = <R>(promise: Promise<R>) => {
    requests.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const holder = prisma.$transaction(async (tx) => {
    if (table === "Issue") await tx.$queryRaw`SELECT id FROM "Issue" WHERE id = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id} FOR UPDATE`;
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    locked.resolve({ tx, pid });
    await release.promise;
  }).catch((cause) => {
    lockError = cause;
    locked.reject(cause);
  });

  try {
    const { tx, pid } = await locked.promise;
    return await run(tx, pid, track);
  } finally {
    release.resolve(undefined);
    await holder;
    await Promise.allSettled(requests);
    if (lockError) throw lockError;
  }
}

async function waitForBlockedTransactions(tx: Prisma.TransactionClient, holderPid: number, table: "Issue" | "Project", count: number) {
  // Synchronize on PostgreSQL's lock state; the deadline only bounds a failed barrier.
  const lockQuery = table === "Issue"
    ? 'SELECT id FROM "Issue" WHERE id = $1 FOR UPDATE'
    : 'SELECT id FROM "Project" WHERE id = $1 FOR UPDATE';
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    await tx.$queryRaw<Array<{ cleared: string }>>`SELECT pg_stat_clear_snapshot()::text AS cleared`;
    const [result] = await tx.$queryRaw<Array<{ count: number }>>`
      WITH RECURSIVE lock_chain(pid) AS (
        SELECT ${holderPid}::int
        UNION
        SELECT waiter.pid
        FROM pg_stat_activity AS waiter
        JOIN lock_chain AS blocker ON blocker.pid = ANY(pg_blocking_pids(waiter.pid))
      )
      SELECT count(DISTINCT activity.pid)::int AS count
      FROM lock_chain
      JOIN pg_stat_activity AS activity USING (pid)
      WHERE activity.pid <> ${holderPid}
        AND activity.query = ${lockQuery}
        AND activity.wait_event_type = 'Lock'
    `;
    if (result.count === count) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Expected ${count} ${table} transaction(s) waiting on PostgreSQL row lock`);
}


async function fixture() {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { id: `visibility-owner-${suffix}`, name: "Visibility owner", email: `visibility-owner-${suffix}@example.test` } });
  const author = await prisma.user.create({ data: { id: `visibility-author-${suffix}`, name: "Visibility author", email: `visibility-author-${suffix}@example.test` } });
  const project = await prisma.project.create({ data: { slug: `visibility-${suffix}`, title: "Visibility project", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id } });
  const discussion = await prisma.discussion.create({ data: { projectId: project.id, authorId: owner.id, title: "Design notes", body: "" } });
  const issue = await prisma.issue.create({ data: { projectId: project.id, authorId: owner.id, title: "Review the design" } });
  mocks.getSession.mockResolvedValue({ user: { id: author.id } });
  return { owner, author, project, discussion, issue };
}
databaseDescribe("privacy transition vs project content creation", () => {
  afterAll(() => prisma.$disconnect());
  it("rejects late Discussion comments after project becomes private", async () => {
    const f = await fixture();
    const { response } = await withRowLock("Project", f.project.id, async (tx, pid, track) => {
      const response = track(postProjectDiscussionComment(request({ body: "Late note" }), { slug: f.project.slug, id: f.discussion.id }));
      await waitForBlockedTransactions(tx, pid, "Project", 1);
      await tx.project.update({ where: { id: f.project.id }, data: { isPublic: false } });
      return { response };
    });
    expect((await response).status).toBe(404);
    expect(await prisma.discussionComment.count({ where: { discussionId: f.discussion.id } })).toBe(0);
  });
  it("rejects late Discussion creation and owner notification after privacy transition", async () => {
    const f = await fixture();
    const { response } = await withRowLock("Project", f.project.id, async (tx, pid, track) => {
      const response = track(postProjectDiscussion(request({ title: "Late thread" }), { slug: f.project.slug }));
      await waitForBlockedTransactions(tx, pid, "Project", 1);
      await tx.project.update({ where: { id: f.project.id }, data: { isPublic: false } });
      return { response };
    });
    expect((await response).status).toBe(404);
    expect(await prisma.discussion.count({ where: { projectId: f.project.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
  });
  it("rejects late Issue creation and owner notification after privacy transition", async () => {
    const f = await fixture();
    const { response } = await withRowLock("Project", f.project.id, async (tx, pid, track) => {
      const response = track(postIssue(request({ title: "Late issue" }), { params: Promise.resolve({ slug: f.project.slug }) }));
      await waitForBlockedTransactions(tx, pid, "Project", 1);
      await tx.project.update({ where: { id: f.project.id }, data: { isPublic: false } });
      return { response };
    });
    expect((await response).status).toBe(404);
    expect(await prisma.issue.count({ where: { projectId: f.project.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { projectId: f.project.id } })).toBe(0);
  });
  it("rejects late Issue comments while preserving Issue close locks", async () => {
    const f = await fixture();
    const { response } = await withRowLock("Project", f.project.id, async (tx, pid, track) => {
      const response = track(postIssueComment(request({ body: "Late note" }), { id: f.issue.id }));
      await waitForBlockedTransactions(tx, pid, "Project", 1);
      await tx.project.update({ where: { id: f.project.id }, data: { isPublic: false } });
      return { response };
    });
    expect((await response).status).toBe(404);
    expect(await prisma.issueComment.count({ where: { issueId: f.issue.id } })).toBe(0);
  });
});
