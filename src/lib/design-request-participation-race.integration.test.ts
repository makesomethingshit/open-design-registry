import { afterAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { patchIssue } = await import("./issue-handlers");
const { deleteDesignRequestParticipation, postDesignRequestParticipation, readDesignRequestParticipationSnapshot } = await import("./design-request-participation");

const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function request(method: string, userId: string, body?: unknown) {
  return new Request("http://localhost/api/issues/issue/participation", { method, headers: { "content-type": "application/json", "x-test-user": userId }, body: body === undefined ? undefined : JSON.stringify(body) });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function withIssueRowLock<T>(id: string, run: (tx: Prisma.TransactionClient, holderPid: number, track: <R>(promise: Promise<R>) => Promise<R>) => Promise<T>) {
  const locked = deferred<number>();
  const release = deferred<void>();
  const requests: Promise<unknown>[] = [];
  let holderTx!: Prisma.TransactionClient;
  const holder = prisma.$transaction(async (tx) => {
    holderTx = tx;
    await tx.$queryRaw`SELECT id FROM "Issue" WHERE id = ${id} FOR UPDATE`;
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    locked.resolve(pid);
    await release.promise;
  });
  const track = <R>(promise: Promise<R>) => { requests.push(promise); void promise.catch(() => undefined); return promise; };
  try {
    const pid = await locked.promise;
    return await run(holderTx, pid, track);
  } finally {
    release.resolve(undefined);
    await holder;
    await Promise.allSettled(requests);
  }
}

async function waitForBlockedTransactions(tx: Prisma.TransactionClient, holderPid: number, count: number) {
  const query = 'SELECT id FROM "Issue" WHERE id = $1 FOR UPDATE';
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    await tx.$queryRaw`SELECT pg_stat_clear_snapshot()::text AS cleared`;
    const [result] = await tx.$queryRaw<Array<{ count: number }>>`
      WITH RECURSIVE lock_chain(pid) AS (
        SELECT ${holderPid}::int
        UNION
        SELECT waiter.pid FROM pg_stat_activity AS waiter JOIN lock_chain AS blocker ON blocker.pid = ANY(pg_blocking_pids(waiter.pid))
      )
      SELECT count(DISTINCT activity.pid)::int AS count
      FROM lock_chain JOIN pg_stat_activity AS activity USING (pid)
      WHERE activity.pid <> ${holderPid} AND activity.query = ${query} AND activity.wait_event_type = 'Lock'
    `;
    if (result.count === count) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Expected ${count} participation transaction(s) waiting on the Issue row lock`);
}

const fixtureUserIds: string[] = [];
async function fixture() {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { id: `participation-owner-${suffix}`, name: "Request owner", email: `participation-owner-${suffix}@example.test` } });
  fixtureUserIds.push(owner.id);
  const participant = await prisma.user.create({ data: { id: `participation-user-${suffix}`, name: "Request participant", email: `participation-user-${suffix}@example.test` } });
  fixtureUserIds.push(participant.id);
  const project = await prisma.project.create({ data: { slug: `participation-project-${suffix}`, title: "Participation project", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id } });
  const issue = await prisma.issue.create({ data: { projectId: project.id, authorId: owner.id, title: "Open design request", body: "Work on this", kind: "DESIGN_REQUEST" } });
  return { owner, participant, issue };
}

databaseDescribe("design request participation and close race in PostgreSQL", () => {
  afterAll(async () => {
    try { await prisma.user.deleteMany({ where: { id: { in: fixtureUserIds } } }); }
    finally { await prisma.$disconnect(); }
  });

  it("rejects a participation request queued behind close and keeps CLOSED empty after reopen", async () => {
    const f = await fixture();
    mocks.getSession.mockImplementation(async ({ headers }: { headers: Headers }) => ({ user: { id: headers.get("x-test-user") } }));
    const { close, join } = await withIssueRowLock(f.issue.id, async (tx, pid, track) => {
      const close = track(patchIssue(request("PATCH", f.owner.id, { status: "CLOSED" }), { id: f.issue.id }));
      await waitForBlockedTransactions(tx, pid, 1);
      const join = track(postDesignRequestParticipation(request("POST", f.participant.id), { id: f.issue.id }));
      await waitForBlockedTransactions(tx, pid, 2);
      return { close, join };
    });

    expect((await close).status).toBe(200);
    expect((await join).status).toBe(409);
    expect(await prisma.designRequestParticipation.count({ where: { issueId: f.issue.id } })).toBe(0);
    expect((await patchIssue(request("PATCH", f.owner.id, { status: "OPEN" }), { id: f.issue.id })).status).toBe(200);
    expect(await prisma.designRequestParticipation.count({ where: { issueId: f.issue.id } })).toBe(0);
  });

  it("serializes participation before close and removes it in the close transaction", async () => {
    const f = await fixture();
    mocks.getSession.mockImplementation(async ({ headers }: { headers: Headers }) => ({ user: { id: headers.get("x-test-user") } }));
    const { join, close } = await withIssueRowLock(f.issue.id, async (tx, pid, track) => {
      const join = track(postDesignRequestParticipation(request("POST", f.participant.id), { id: f.issue.id }));
      await waitForBlockedTransactions(tx, pid, 1);
      const close = track(patchIssue(request("PATCH", f.owner.id, { status: "CLOSED" }), { id: f.issue.id }));
      await waitForBlockedTransactions(tx, pid, 2);
      return { join, close };
    });

    expect((await join).status).toBe(201);
    expect((await close).status).toBe(200);
    expect(await prisma.designRequestParticipation.count({ where: { issueId: f.issue.id } })).toBe(0);
  });

  it("serializes concurrent POSTs from one user into one row", async () => {
    const f = await fixture();
    mocks.getSession.mockImplementation(async ({ headers }: { headers: Headers }) => ({ user: { id: headers.get("x-test-user") } }));
    const responses = await Promise.all([
      postDesignRequestParticipation(request("POST", f.participant.id), { id: f.issue.id }),
      postDesignRequestParticipation(request("POST", f.participant.id), { id: f.issue.id }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(await prisma.designRequestParticipation.count({ where: { issueId: f.issue.id } })).toBe(1);
  });

  it("keeps count, names, and viewer state in one snapshot across a concurrent join and withdraw", async () => {
    const joinFixture = await fixture();
    const withdrawFixture = await fixture();
    mocks.getSession.mockImplementation(async ({ headers }: { headers: Headers }) => ({ user: { id: headers.get("x-test-user") } }));
    await prisma.designRequestParticipation.create({ data: { issueId: withdrawFixture.issue.id, userId: withdrawFixture.participant.id } });

    const joinSnapshot = await prisma.$transaction(async (tx) => {
      const countBeforeJoin = await tx.designRequestParticipation.count({ where: { issueId: joinFixture.issue.id } });
      const join = postDesignRequestParticipation(request("POST", joinFixture.participant.id), { id: joinFixture.issue.id });
      await Promise.all([join, tx.$queryRaw`SELECT 1`]);
      expect((await join).status).toBe(201);
      return { countBeforeJoin, details: await readDesignRequestParticipationSnapshot(tx, joinFixture.issue.id, joinFixture.participant.id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    expect(joinSnapshot).toEqual({ countBeforeJoin: 0, details: { count: 0, names: [], participating: false } });
    expect(await prisma.designRequestParticipation.count({ where: { issueId: joinFixture.issue.id } })).toBe(1);

    const withdrawSnapshot = await prisma.$transaction(async (tx) => {
      const countBeforeWithdraw = await tx.designRequestParticipation.count({ where: { issueId: withdrawFixture.issue.id } });
      const withdraw = deleteDesignRequestParticipation(request("DELETE", withdrawFixture.participant.id), { id: withdrawFixture.issue.id });
      await Promise.all([withdraw, tx.$queryRaw`SELECT 1`]);
      expect((await withdraw).status).toBe(204);
      return { countBeforeWithdraw, details: await readDesignRequestParticipationSnapshot(tx, withdrawFixture.issue.id, withdrawFixture.participant.id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    expect(withdrawSnapshot).toEqual({ countBeforeWithdraw: 1, details: { count: 1, names: ["Request participant"], participating: true } });
    expect(await prisma.designRequestParticipation.count({ where: { issueId: withdrawFixture.issue.id } })).toBe(0);
  });
});
