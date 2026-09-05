import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Revision } from "@prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !databaseUrl) throw new Error("TEST_DATABASE_URL is required in CI");
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
const { prisma } = await import("./prisma");
const { createContribution, actOnContribution, getContribution, listContributions } = await import("./contributions");
const { notificationVisibility } = await import("./notification-visibility");
const postgres = databaseUrl ? describe : describe.skip;

postgres("contribution workflow with PostgreSQL", () => {
  const suffix = crypto.randomUUID();
  const owner = { id: `contribution-owner-${suffix}`, name: "Project owner" };
  const author = { id: `contribution-author-${suffix}`, name: "Design contributor" };
  const stranger = { id: `contribution-stranger-${suffix}`, name: "Other user" };
  let target: Project; let fork: Project; let base: Revision; let proposed: Revision;
  beforeAll(async () => {
    for (const user of [owner, author, stranger]) await prisma.user.create({ data: { ...user, email: `${user.id}@example.test` } });
  });
  afterAll(() => prisma.$disconnect());
  async function publish(projectId: string, title: string, license = "MIT") {
    return prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const latest = await db.revision.findFirst({ where: { projectId }, orderBy: { number: "desc" } });
      const key = `contribution-tests/${crypto.randomUUID()}`;
      const staged = await db.revision.create({ data: {
        projectId, number: (latest?.number ?? 0) + 1, parentId: latest?.id, title, changeDescription: title, license,
        sourceKey: `${key}/source.zip`, sourceChecksum: "a".repeat(64), tool: "penpot", tags: ["poster"], isPublished: false,
        previews: { create: [{ position: 0, key: `${key}/preview.png`, url: `/api/assets?key=${key}/preview.png`, mimeType: "image/png", size: 1, altText: title }] },
      } });
      return db.revision.update({ where: { id: staged.id }, data: { isPublished: true } });
    });
  }
  beforeEach(async () => {
    const unique = crypto.randomUUID();
    target = await prisma.project.create({ data: { slug: `target-${unique}`, title: "Shared design", description: "", license: "MIT", coverUrl: "cover", ownerId: owner.id } });
    base = await publish(target.id, "Initial design");
    fork = await prisma.project.create({ data: { slug: `fork-${unique}`, title: "Improved design", description: "", license: "MIT", coverUrl: "cover", ownerId: author.id, forkedFromProjectId: target.id, forkedFromRevisionId: base.id, forkedFromLicense: "MIT" } });
    proposed = await publish(fork.id, "Better typography");
  });
  const input = () => ({ title: "Improve typography", body: "Clearer hierarchy", baseRevisionId: base.id, proposedRevisionId: proposed.id, rightsConfirmed: true });
  const accept = (expectedVersion = 1) => ({ action: "accept", expectedVersion, rightsConfirmed: true });

  it("accepts a reviewed snapshot once under concurrent requests and preserves attribution", async () => {
    const proposal = await createContribution(target.slug, author, input());
    await actOnContribution(target.slug, proposal.id, stranger, { action: "comment", body: "The hierarchy is clearer." });
    await Promise.all([actOnContribution(target.slug, proposal.id, owner, accept()), actOnContribution(target.slug, proposal.id, owner, accept())]);
    const result = await getContribution(target.slug, proposal.id);
    expect(result.contribution.status).toBe("ACCEPTED");
    expect(result.contribution.acceptedRevision).toMatchObject({ number: 2, contributorName: author.name, acceptedByName: owner.name });
    const revision = await prisma.revision.findUniqueOrThrow({ where: { acceptedContributionId: proposal.id }, include: { previews: true } });
    expect(revision).toMatchObject({ parentId: base.id, sourceKey: proposed.sourceKey, license: "MIT", contributorId: author.id, acceptedById: owner.id, sourceChecksum: proposed.sourceChecksum });
    expect(revision.previews).toHaveLength(1);
    expect(await prisma.revision.count({ where: { projectId: target.id } })).toBe(2);
    expect(await prisma.contributionEvent.count({ where: { contributionId: proposal.id, type: "ACCEPTED" } })).toBe(1);
    await expect(prisma.revision.update({ where: { id: revision.id }, data: { contributorName: "Other author" } })).rejects.toThrow();
    await expect(prisma.contribution.update({ where: { id: proposal.id }, data: { proposedRevisionId: base.id, version: { increment: 1 } } })).rejects.toThrow();
    const event = result.events[0];
    await expect(prisma.contributionEvent.update({ where: { id: event.id }, data: { body: "Rewrite history" } })).rejects.toThrow();
  });
  it("blocks unrelated forks, other authors and missing publication confirmation", async () => {
    await expect(createContribution(target.slug, stranger, input())).rejects.toMatchObject({ status: 400 });
    await expect(createContribution(target.slug, author, { ...input(), rightsConfirmed: false })).rejects.toMatchObject({ status: 400 });
    await prisma.project.update({ where: { id: fork.id }, data: { forkedFromProjectId: null } });
    await expect(createContribution(target.slug, author, input())).rejects.toMatchObject({ status: 400 });
    expect(await prisma.contribution.count({ where: { projectId: target.id } })).toBe(0);
  });
  it("requires owner review and a fresh reviewed proposal version", async () => {
    const proposal = await createContribution(target.slug, author, input());
    await expect(actOnContribution(target.slug, proposal.id, author, accept())).rejects.toMatchObject({ status: 403 });
    await expect(actOnContribution(target.slug, proposal.id, stranger, { action: "reject", expectedVersion: 1, body: "No" })).rejects.toMatchObject({ status: 403 });
    await actOnContribution(target.slug, proposal.id, owner, { action: "request_changes", expectedVersion: 1, body: "Increase contrast" });
    await expect(actOnContribution(target.slug, proposal.id, owner, accept(2))).rejects.toMatchObject({ status: 409 });
    const revised = await publish(fork.id, "Higher contrast");
    await actOnContribution(target.slug, proposal.id, author, { action: "update", expectedVersion: 2, proposedRevisionId: revised.id, baseRevisionId: base.id, rightsConfirmed: true, body: "Increased contrast" });
    await expect(actOnContribution(target.slug, proposal.id, owner, accept(1))).rejects.toMatchObject({ status: 409 });
    await actOnContribution(target.slug, proposal.id, owner, accept(3));
    const detail = await getContribution(target.slug, proposal.id);
    expect(detail.events.map((event) => event.type)).toEqual(["OPENED", "CHANGES_REQUESTED", "UPDATED", "ACCEPTED"]);
    expect(detail.events[0].proposedRevisionId).toBe(proposed.id);
    expect(detail.contribution.proposedRevisionId).toBe(revised.id);
  });
  it("rejects stale project baselines and mismatched licenses without publishing", async () => {
    const proposal = await createContribution(target.slug, author, input());
    const latest = await publish(target.id, "Another accepted change");
    await expect(actOnContribution(target.slug, proposal.id, owner, accept())).rejects.toMatchObject({ status: 409 });
    await actOnContribution(target.slug, proposal.id, author, { action: "update", expectedVersion: 1, proposedRevisionId: proposed.id, baseRevisionId: latest.id, rightsConfirmed: true, body: "Compared against the new baseline" });
    await prisma.project.update({ where: { id: target.id }, data: { license: "CC BY 4.0" } });
    await expect(actOnContribution(target.slug, proposal.id, owner, accept(2))).rejects.toMatchObject({ status: 409 });
    expect(await prisma.revision.count({ where: { projectId: target.id } })).toBe(2);
  });
  it("rolls back the accepted revision and status when notification storage fails", async () => {
    const proposal = await createContribution(target.slug, author, input());
    const realTransaction = prisma.$transaction.bind(prisma);
    // Fail the final write inside a real DB transaction, after revision publication.
    const transactionSpy = vi.spyOn(prisma, "$transaction").mockImplementation(((callback: (db: any) => Promise<any>) => realTransaction(async (db) => {
      const failure = vi.spyOn(db.notification, "create").mockRejectedValueOnce(new Error("notification storage failed"));
      try { return await callback(db); } finally { failure.mockRestore(); }
    })) as typeof prisma.$transaction);
    try {
      await expect(actOnContribution(target.slug, proposal.id, owner, accept())).rejects.toThrow("notification storage failed");
      expect(await prisma.revision.count({ where: { projectId: target.id } })).toBe(1);
      expect((await prisma.contribution.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("OPEN");
      expect(await prisma.contributionEvent.count({ where: { contributionId: proposal.id } })).toBe(1);
    } finally {
      transactionSpy.mockRestore();
      // Prisma exposes methods through a proxy; descriptor restoration alone
      // can remove the delegated method. Restore the callable explicitly.
      prisma.$transaction = realTransaction;
    }
  });
  it("hides private target proposals and notifications while preserving authorized review snapshots", async () => {
    const proposal = await createContribution(target.slug, author, input());
    await actOnContribution(target.slug, proposal.id, owner, { action: "request_changes", expectedVersion: 1, body: "Review notes" });
    await prisma.project.update({ where: { id: fork.id }, data: { isPublic: false } });
    expect((await getContribution(target.slug, proposal.id)).contribution.proposedRevision.id).toBe(proposed.id);
    await prisma.project.update({ where: { id: target.id }, data: { isPublic: false } });
    await expect(getContribution(target.slug, proposal.id, author.id)).rejects.toMatchObject({ status: 404 });
    await expect(listContributions(target.slug)).rejects.toMatchObject({ status: 404 });
    await expect(actOnContribution(target.slug, proposal.id, author, { action: "comment", body: "Test" })).rejects.toMatchObject({ status: 404 });
    expect((await getContribution(target.slug, proposal.id, owner.id)).contribution.id).toBe(proposal.id);
    expect(await prisma.notification.count({ where: { ...notificationVisibility(author.id), contributionId: proposal.id } })).toBe(0);
  });
  it("retains a rejected discussion but prevents later acceptance", async () => {
    const proposal = await createContribution(target.slug, author, input());
    await actOnContribution(target.slug, proposal.id, owner, { action: "reject", expectedVersion: 1, body: "Different direction" });
    await expect(actOnContribution(target.slug, proposal.id, owner, accept(2))).rejects.toMatchObject({ status: 409 });
    await actOnContribution(target.slug, proposal.id, author, { action: "comment", body: "Understood" });
    expect((await getContribution(target.slug, proposal.id)).events.at(-1)?.body).toBe("Understood");
  });
});
