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
    const pending = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Issue" WHERE id = ${f.issue.id} FOR UPDATE`;
      const late = postIssueComment(request({ body: "late" }), { id: f.issue.id });
      await tx.issue.update({ where: { id: f.issue.id }, data: { status: "CLOSED", closedAt: new Date(), closedBy: f.owner.id } });
      return late;
    });
    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Issue is closed" });
    expect(await prisma.issueComment.count({ where: { issueId: f.issue.id } })).toBe(0);
  });

  it("keeps an in-flight issue comment and closes afterwards", async () => {
    const f = await fixture();
    const pending = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Issue" WHERE id = ${f.issue.id} FOR UPDATE`;
      return postIssueComment(request({ body: "early" }), { id: f.issue.id });
    });
    expect((await pending).status).toBe(201);
    expect(await prisma.issueComment.count({ where: { issueId: f.issue.id } })).toBe(1);
    expect((await patchIssue(request({ status: "CLOSED" }), { id: f.issue.id })).status).toBe(200);
    expect(await prisma.issue.findUniqueOrThrow({ where: { id: f.issue.id }, select: { status: true } })).toMatchObject({ status: "CLOSED" });
  });

  it("rejects a proposal comment when close commits while the comment is in flight", async () => {
    const f = await fixture();
    const pending = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${f.proposal.projectId} FOR UPDATE`;
      const late = postProposalComment(request({ body: "late" }), { id: f.proposal.id });
      await tx.proposal.update({ where: { id: f.proposal.id }, data: { status: "CLOSED" } });
      return late;
    });
    const response = await pending;
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Proposal is closed" });
    expect(await prisma.proposalComment.count({ where: { proposalId: f.proposal.id } })).toBe(0);
  });

  it("keeps an in-flight proposal comment and closes afterwards", async () => {
    const f = await fixture();
    const pending = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${f.proposal.projectId} FOR UPDATE`;
      return postProposalComment(request({ body: "early" }), { id: f.proposal.id });
    });
    expect((await pending).status).toBe(201);
    expect(await prisma.proposalComment.count({ where: { proposalId: f.proposal.id } })).toBe(1);
    expect((await closeProposal(request({ status: "CLOSED" }), { id: f.proposal.id })).status).toBe(200);
    expect(await prisma.proposal.findUniqueOrThrow({ where: { id: f.proposal.id }, select: { status: true } })).toMatchObject({ status: "CLOSED" });
  });
});

// ponytail: no row cleanup; the Revision immutability trigger rejects deletes
// and CI uses an ephemeral database. Fixture ids are UUID-suffixed per test.

