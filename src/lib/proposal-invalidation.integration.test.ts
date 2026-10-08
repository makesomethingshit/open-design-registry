import type { ChangeType } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { RevisionBundle } from "./revision-bundle";

const testState = vi.hoisted(() => ({ getSession: vi.fn(), bundles: new Map<string, unknown>() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: testState.getSession } } }));
vi.mock("./storage", () => ({
  publicAssetUrl: (value: string) => value,
  deleteObject: async (key: string) => { testState.bundles.delete(key); },
}));
vi.mock("./revision-bundle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./revision-bundle")>();
  return {
    ...actual,
    readRevisionBundle: async (key: string) => testState.bundles.get(key) ?? null,
    putRevisionBundle: async (key: string, bundle: unknown) => {
      testState.bundles.set(key, bundle);
      return { checksum: "f".repeat(64) };
    },
  };
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required in CI");
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
const databaseDescribe = testDatabaseUrl ? describe : describe.skip;
const { prisma } = await import("./prisma");
const { applyProposal } = await import("./proposal-handlers");

type ChangeSeed = { type: ChangeType; action: ChangeType | null; target: string; targetFileId: string | null; name: string | null; newName: string | null };

function bundle(homeName: string, homeChecksum: string, otherChecksum: string, prefix: string): RevisionBundle {
  return {
    version: 2,
    files: [
      { id: "home", name: homeName, kind: "artboard", mimeType: "image/png", size: 10, assetKey: `${prefix}-home`, previewKeys: [`${prefix}-home-preview`], checksum: homeChecksum },
      { id: "other", name: "Other", kind: "asset", mimeType: "image/png", size: 12, assetKey: `${prefix}-other`, previewKeys: [`${prefix}-other-preview`], checksum: otherChecksum },
    ],
  };
}

async function fixture(baseBundle: RevisionBundle, sourceBundle: RevisionBundle) {
  testState.bundles.clear();
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const owner = await prisma.user.create({ data: { id: `rename-test-${suffix}`, name: "Rename test", email: `rename-test-${suffix}@example.test` } });
  const [target, source] = await Promise.all(["target", "source"].map((part) => prisma.project.create({
    data: { slug: `rename-${part}-${suffix}`, title: `Rename ${part}`, description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id },
  })));
  const [baseRevision, sourceRevision] = await prisma.$transaction(async (tx) => {
    const [base, sourceRevisionRow] = await Promise.all([
      tx.revision.create({ data: { projectId: target.id, number: 1, title: "Base", changeDescription: "Initial", license: "MIT", sourceKey: `rename-base-${suffix}`, isPublished: false } }),
      tx.revision.create({ data: { projectId: source.id, number: 1, title: "Source", changeDescription: "Source", license: "MIT", sourceKey: `rename-source-${suffix}`, isPublished: false } }),
    ]);
    const previews = (revisionId: string, files: RevisionBundle["files"]) => tx.preview.createMany({
      data: [...new Set(files.flatMap((file) => file.previewKeys))].map((key, position) => ({ revisionId, position, key, url: `https://example.test/${key}.png`, mimeType: "image/png", size: 1, altText: key })),
    });
    await Promise.all([previews(base.id, baseBundle.files), previews(sourceRevisionRow.id, sourceBundle.files)]);
    return Promise.all([base, sourceRevisionRow].map(({ id }) => tx.revision.update({ where: { id }, data: { isPublished: true } })));
  });
  testState.bundles.set(baseRevision.sourceKey!, baseBundle);
  testState.bundles.set(sourceRevision.sourceKey!, sourceBundle);
  testState.getSession.mockResolvedValue({ user: owner });
  return { owner, target, baseRevision, sourceRevision };
}

async function proposal(f: Awaited<ReturnType<typeof fixture>>, proposalNumber: number, title: string, changes: ChangeSeed[]) {
  const reviewedAt = new Date("2026-10-01T00:00:00.000Z");
  const result = await prisma.proposal.create({
    data: {
      projectId: f.target.id,
      proposalNumber,
      baseRevisionId: f.baseRevision.id,
      sourceRevisionId: f.sourceRevision.id,
      authorId: f.owner.id,
      title,
      body: title,
      status: "APPROVED",
      changeSet: { create: { changes: { create: changes.map((change, index) => ({
        ...change,
        reviewStatus: "APPROVED",
        reviewComment: `review comment ${proposalNumber}-${index}`,
        reviewedById: f.owner.id,
        reviewedAt,
      })) } } },
    },
    include: { changeSet: { include: { changes: true } } },
  });
  for (const change of result.changeSet!.changes) {
    await prisma.changeReview.create({ data: {
      changeId: change.id,
      authorId: f.owner.id,
      status: "APPROVED",
      eventType: "REVIEW",
      comment: `review history ${change.id}`,
      checkedLatestRevisionId: f.baseRevision.id,
      createdAt: reviewedAt,
    } });
  }
  return { ...result, changes: result.changeSet!.changes };
}

async function approvals(f: Awaited<ReturnType<typeof fixture>>) {
  const modernRename = await proposal(f, 2, "Approved rename", [{ type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Home", targetFileId: "home", name: "Home", newName: "Dashboard" }]);
  const legacyRename = await proposal(f, 3, "Legacy approved rename", [{ type: "RENAME_UNIT", action: null, target: "Home", targetFileId: "home", name: "Home", newName: "Canvas" }]);
  const modify = await proposal(f, 4, "Approved modification", [{ type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Home", targetFileId: "home", name: "Home", newName: null }]);
  const otherRename = await proposal(f, 5, "Other unit rename", [{ type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Other", targetFileId: "other", name: "Other", newName: "Other asset" }]);
  return { modernRename: modernRename.changes[0]!, legacyRename: legacyRename.changes[0]!, modify: modify.changes[0]!, otherRename: otherRename.changes[0]! };
}

function applyRequest(changeId: string) {
  return new Request("http://localhost/api/proposals/rename-test/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ changeIds: [changeId] }),
  });
}

async function withInvalidationHistoryFailure(projectId: string, run: () => Promise<void>) {
  const name = `rename_history_failure_${crypto.randomUUID().replaceAll("-", "")}`;
  expect(projectId).toMatch(/^[a-z0-9]+$/i);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger AS $$
    BEGIN
      IF NEW."eventType" = 'INVALIDATED_UPSTREAM' AND EXISTS (
        SELECT 1 FROM "Change" c
        JOIN "ChangeSet" cs ON cs.id = c."changeSetId"
        JOIN "Proposal" p ON p.id = cs."proposalId"
        WHERE c.id = NEW."changeId" AND p."projectId" = '${projectId}'
      ) THEN RAISE EXCEPTION 'invalidation history unavailable'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  try {
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "ChangeReview" FOR EACH ROW EXECUTE FUNCTION "${name}"()`);
    await run();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "ChangeReview"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}"()`);
  }
}

databaseDescribe("upstream proposal approval invalidation in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("invalidates only same-unit Rename approvals for a name-only apply", async () => {
    const f = await fixture(bundle("Home", "a".repeat(64), "b".repeat(64), "target"), bundle("Home", "a".repeat(64), "b".repeat(64), "source"));
    const existing = await approvals(f);
    const unchangedHistories = await prisma.changeReview.findMany({ where: { changeId: { in: [existing.modify.id, existing.otherRename.id] } }, orderBy: { id: "asc" } });
    const upstream = await proposal(f, 1, "Rename upstream", [{ type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Home", targetFileId: "home", name: "Home", newName: "Landing" }]);

    const response = await applyProposal(applyRequest(upstream.changes[0]!.id), { id: upstream.id });
    expect(response.status).toBe(201);
    const { revision } = await response.json();
    const current = await prisma.change.findMany({ where: { id: { in: Object.values(existing).map((change) => change.id) } }, orderBy: { id: "asc" } });
    const currentById = new Map(current.map((change) => [change.id, change]));
    for (const change of [existing.modernRename, existing.legacyRename]) {
      expect(currentById.get(change.id)).toMatchObject({ reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null });
    }
    expect(currentById.get(existing.modify.id)).toMatchObject({ reviewStatus: "APPROVED", reviewComment: "review comment 4-0", reviewedById: f.owner.id, reviewedAt: new Date("2026-10-01T00:00:00.000Z") });
    expect(currentById.get(existing.otherRename.id)).toMatchObject({ reviewStatus: "APPROVED", reviewComment: "review comment 5-0", reviewedById: f.owner.id, reviewedAt: new Date("2026-10-01T00:00:00.000Z") });
    expect(await prisma.changeReview.findMany({ where: { changeId: { in: [existing.modify.id, existing.otherRename.id] } }, orderBy: { id: "asc" } })).toEqual(unchangedHistories);
    expect(await prisma.changeReview.findMany({ where: { changeId: { in: [existing.modernRename.id, existing.legacyRename.id] }, eventType: "INVALIDATED_UPSTREAM" } })).toMatchObject([
      { status: "PENDING", causedByRevisionId: revision.id },
      { status: "PENDING", causedByRevisionId: revision.id },
    ]);
  });

  it("uses content invalidation when an upstream apply changes both name and checksum", async () => {
    const base = bundle("Home", "a".repeat(64), "b".repeat(64), "target");
    const changed = bundle("Landing", "c".repeat(64), "b".repeat(64), "source");
    const f = await fixture(base, changed);
    const existing = await approvals(f);
    const wholeDocument = await proposal(f, 1, "Replace document upstream", [{ type: "REPLACE_DOCUMENT", action: "REPLACE_DOCUMENT", target: "whole_document", targetFileId: null, name: null, newName: null }]);

    const response = await applyProposal(applyRequest(wholeDocument.changes[0]!.id), { id: wholeDocument.id });
    expect(response.status).toBe(201);
    const rows = await prisma.change.findMany({ where: { id: { in: Object.values(existing).map((change) => change.id) } } });
    const byId = new Map(rows.map((change) => [change.id, change]));
    for (const change of [existing.modernRename, existing.legacyRename, existing.modify]) {
      expect(byId.get(change.id)).toMatchObject({ reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null });
    }
    expect(byId.get(existing.otherRename.id)).toMatchObject({ reviewStatus: "APPROVED", reviewedById: f.owner.id });
  });

  it("rolls back the new Revision and approval resets when invalidation history cannot persist", async () => {
    const f = await fixture(bundle("Home", "a".repeat(64), "b".repeat(64), "target"), bundle("Home", "a".repeat(64), "b".repeat(64), "source"));
    const existing = await approvals(f);
    const upstream = await proposal(f, 1, "Rename upstream", [{ type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Home", targetFileId: "home", name: "Home", newName: "Landing" }]);
    const historyBefore = await prisma.changeReview.count({ where: { changeId: { in: Object.values(existing).map((change) => change.id) } } });

    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await withInvalidationHistoryFailure(f.target.id, async () => {
        const response = await applyProposal(applyRequest(upstream.changes[0]!.id), { id: upstream.id });
        expect(response.status).toBe(500);
      });
    } finally {
      errorLog.mockRestore();
    }
    expect(await prisma.revision.count({ where: { projectId: f.target.id } })).toBe(1);
    const unchangedApprovals = await prisma.change.findMany({ where: { id: { in: Object.values(existing).map((change) => change.id) } } });
    const unchangedById = new Map(unchangedApprovals.map((change) => [change.id, change]));
    for (const change of Object.values(existing)) expect(unchangedById.get(change.id)).toMatchObject({ reviewStatus: "APPROVED", reviewedById: f.owner.id });
    expect(await prisma.changeReview.count({ where: { changeId: { in: Object.values(existing).map((change) => change.id) } } })).toBe(historyBefore);
    expect(await prisma.change.findUnique({ where: { id: upstream.changes[0]!.id } })).toMatchObject({ reviewStatus: "APPROVED", appliedRevisionId: null });
  });
});
