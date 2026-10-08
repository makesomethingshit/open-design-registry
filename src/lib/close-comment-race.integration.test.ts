import { afterAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./storage", () => ({ publicAssetUrl: (value: string) => value, deleteObject: vi.fn() }));
vi.mock("./revision-bundle", () => ({ readRevisionBundle: vi.fn().mockResolvedValue(null) }));

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { patchIssue, postIssueComment } = await import("./issue-handlers");
const { closeProposal, postProposalComment } = await import("./proposal-handlers");

const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function request(body: unknown) {
  return new Request("http://localhost/api/close-comment-race", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function withRowLock<T>(table: "Issue" | "Project", id: string, run: () => Promise<T>) {
  const locked = deferred<void>();
  const release = deferred<void>();
  let lockError: unknown;
  const holder = prisma.$transaction(async (tx) => {
    if (table === "Issue") await tx.$queryRaw`SELECT id FROM "Issue" WHERE id = ${id} FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${id} FOR UPDATE`;
    locked.resolve(undefined);
    await release.promise;
  }).catch((cause) => {
    lockError = cause;
    locked.reject(cause);
  });

  try {
    await locked.promise;
    return await run();
  } finally {
    release.resolve(undefined);
    await holder;
    if (lockError) throw lockError;
  }
}

async function waitForBlockedTransactions(table: "Issue" | "Project", count: number) {
  // Synchronize on PostgreSQL's lock state; the deadline only bounds a failed barrier.
  const lockQuery = table === "Issue"
    ? 'SELECT id FROM "Issue" WHERE id = $1 FOR UPDATE'
    : 'SELECT id, "ownerId", license, "isPublic" FROM "Project" WHERE id = $1 FOR UPDATE';
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const [result] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE query = ${lockQuery} AND wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0
    `;
    if (result.count >= count) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Expected ${count} ${table} transaction(s) waiting on PostgreSQL row lock`);
}

async function fixture() {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { id: `race-owner-${suffix}`, name: "Race owner", email: `race-owner-${suffix}@example.test` } });
  const author = await prisma.user.create({ data: { id: `race-author-${suffix}`, name: "Race author", email: `race-author-${suffix}@example.test` } });
  const target = await prisma.project.create({ data: { slug: `race-target-${suffix}`, title: "Race target", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id } });
  const source = await prisma.project.create({ data: { slug: `race-source-${suffix}`, title: "Race source", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: author.id } });
  const baseRevision = await prisma.revision.create({ data: { projectId: target.id, number: 1, title: "Base", changeDescription: "Base", sourceUrl: `https://example.test/${suffix}/base.zip` } });
  const sourceRevision = await prisma.revision.create({ data: { projectId: source.id, number: 1, title: "Source", changeDescription: "Source", sourceUrl: `https://example.test/${suffix}/source.zip` } });
  const issue = await prisma.issue.create({ data: { projectId: target.id, authorId: owner.id, title: "Race issue" } });
  const proposal = await prisma.proposal.create({ data: { projectId: target.id, proposalNumber: 1, authorId: author.id, baseRevisionId: baseRevision.id, sourceRevisionId: sourceRevision.id, title: "Race proposal", body: "Race proposal" } });
  mocks.getSession.mockResolvedValue({ user: { id: owner.id } });
  return { owner, issue, proposal };
}

// The helper holds the contested row lock while the comment request is in
// flight, so every interleaving overlaps the close: the comment either fails
// its pre-check on CLOSED or blocks until the close commits and then fails
// the in-transaction re-read. No timing assumption is involved.
databaseDescribe("close/comment race in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("rejects an issue comment when close commits while the comment is in flight", async () => {
    const f = await fixture();
    const { close, comment } = await withRowLock("Issue", f.issue.id, async () => {
      const close = patchIssue(request({ status: "CLOSED" }), { id: f.issue.id });
      await waitForBlockedTransactions("Issue", 1);
      const comment = postIssueComment(request({ body: "late" }), { id: f.issue.id });
      await waitForBlockedTransactions("Issue", 2);
      return { close, comment };
    });
    expect((await close).status).toBe(200);
    const response = await comment;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Issue is closed" });
    expect(await prisma.issueComment.count({ where: { issueId: f.issue.id } })).toBe(0);
  });

  it("keeps an in-flight issue comment and closes afterwards", async () => {
    const f = await fixture();
    const { comment, close } = await withRowLock("Issue", f.issue.id, async () => {
      const comment = postIssueComment(request({ body: "early" }), { id: f.issue.id });
      await waitForBlockedTransactions("Issue", 1);
      const close = patchIssue(request({ status: "CLOSED" }), { id: f.issue.id });
      await waitForBlockedTransactions("Issue", 2);
      return { comment, close };
    });
    expect((await comment).status).toBe(201);
    expect(await prisma.issueComment.count({ where: { issueId: f.issue.id } })).toBe(1);
    expect((await close).status).toBe(200);
    expect(await prisma.issue.findUniqueOrThrow({ where: { id: f.issue.id }, select: { status: true } })).toMatchObject({ status: "CLOSED" });
  });

  it("rejects a proposal comment when close commits while the comment is in flight", async () => {
    const f = await fixture();
    const { close, comment } = await withRowLock("Project", f.proposal.projectId, async () => {
      const close = closeProposal(request({ status: "CLOSED" }), { id: f.proposal.id });
      await waitForBlockedTransactions("Project", 1);
      const comment = postProposalComment(request({ body: "late" }), { id: f.proposal.id });
      await waitForBlockedTransactions("Project", 2);
      return { close, comment };
    });
    expect((await close).status).toBe(200);
    const response = await comment;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Proposal is closed" });
    expect(await prisma.proposalComment.count({ where: { proposalId: f.proposal.id } })).toBe(0);
  });

  it("keeps an in-flight proposal comment and closes afterwards", async () => {
    const f = await fixture();
    const { comment, close } = await withRowLock("Project", f.proposal.projectId, async () => {
      const comment = postProposalComment(request({ body: "early" }), { id: f.proposal.id });
      await waitForBlockedTransactions("Project", 1);
      const close = closeProposal(request({ status: "CLOSED" }), { id: f.proposal.id });
      await waitForBlockedTransactions("Project", 2);
      return { comment, close };
    });
    expect((await comment).status).toBe(201);
    expect(await prisma.proposalComment.count({ where: { proposalId: f.proposal.id } })).toBe(1);
    expect((await close).status).toBe(200);
    expect(await prisma.proposal.findUniqueOrThrow({ where: { id: f.proposal.id }, select: { status: true } })).toMatchObject({ status: "CLOSED" });
  });
});

// ponytail: no row cleanup; the Revision immutability trigger rejects deletes
// and CI uses an ephemeral database. Fixture ids are UUID-suffixed per test.

