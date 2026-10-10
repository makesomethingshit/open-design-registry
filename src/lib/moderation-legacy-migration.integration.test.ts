import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const db = testDatabaseUrl ? describe : describe.skip;
const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl ?? "postgresql://unused" });

async function executeSql(tx: { $executeRawUnsafe: (query: string) => Promise<unknown> }, sql: string) {
  for (const statement of sql.split(/;\s*(?=\r?\n|$)/).map((part) => part.trim()).filter(Boolean)) {
    await tx.$executeRawUnsafe(statement);
  }
}

db("legacy moderation migration", () => {
  afterAll(() => prisma.$disconnect());

  it("retains only conservative private legacy hides and is idempotent", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const schema = `legacy_migration_${suffix}`;
    const scopeMigrationSql = await readFile(resolve(process.cwd(), "prisma/migrations/20261010000000_moderation_asset_scope/migration.sql"), "utf8");
    const retentionMigrationSql = await readFile(resolve(process.cwd(), "prisma/migrations/20261011000000_moderation_audit_retention/migration.sql"), "utf8");
    const legacyMigrationSql = await readFile(resolve(process.cwd(), "prisma/migrations/20261012000000_legacy_moderation_review/migration.sql"), "utf8");
    const scopeStartedAt = new Date("2026-10-10T00:00:00.000Z");
    const oldReviewedAt = new Date("2026-10-09T23:00:00.000Z");
    const postReviewPreMigration = new Date("2026-10-09T23:15:00.000Z");
    const existingHoldReviewedAt = new Date("2026-10-09T23:30:00.000Z");
    const freshReviewedAt = new Date("2026-10-10T01:00:00.000Z");

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(`CREATE TABLE "_prisma_migrations" ("id" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL, "finished_at" TIMESTAMP(3), "migration_name" TEXT NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMP(3), "started_at" TIMESTAMP(3) NOT NULL, "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`);
        await tx.$executeRawUnsafe(`CREATE TABLE "Project" ("id" TEXT PRIMARY KEY, "coverUrl" TEXT NOT NULL, "isPublic" BOOLEAN NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT '2026-10-09 00:00:00')`);
        await tx.$executeRawUnsafe(`CREATE TABLE "Revision" ("id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL)`);
        await tx.$executeRawUnsafe(`CREATE TABLE "Report" ("id" TEXT PRIMARY KEY, "projectId" TEXT, "revisionId" TEXT, "reason" TEXT NOT NULL, "details" TEXT NOT NULL, "status" TEXT NOT NULL, "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3))`);
        await tx.$executeRaw`INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "started_at") VALUES (${`scope-${suffix}`}, 'test', '20261010000000_moderation_asset_scope', ${scopeStartedAt}, ${scopeStartedAt})`;
        await tx.$executeRaw`INSERT INTO "Project" ("id", "coverUrl", "isPublic") VALUES
          (${`old-direct-${suffix}`}, ${`covers/${suffix}/shared`}, false),
          (${`old-fork-${suffix}`}, ${`covers/${suffix}/shared`}, false),
          (${`existing-hold-${suffix}`}, ${`covers/${suffix}/shared`}, false),
          (${`public-peer-${suffix}`}, ${`covers/${suffix}/shared`}, true),
          (${`unrelated-${suffix}`}, ${`covers/${suffix}/unrelated`}, false),
          (${`fresh-${suffix}`}, ${`covers/${suffix}/fresh`}, false),
          (${`evented-${suffix}`}, ${`covers/${suffix}/evented`}, false),
          (${`revision-${suffix}`}, ${`covers/${suffix}/revision`}, false),
          (${`blank-target-${suffix}`}, '', false),
          (${`blank-peer-${suffix}`}, '', false),
          (${`blank-public-${suffix}`}, '', true)`;
        // These projects predate the migration but did NOT exist when the old
        // decision was made; neither shared nor blank covers imply an old hide.
        await tx.$executeRaw`INSERT INTO "Project" ("id", "coverUrl", "isPublic", "createdAt") VALUES
          (${`post-review-peer-${suffix}`}, ${`covers/${suffix}/shared`}, false, ${postReviewPreMigration}),
          (${`post-review-blank-${suffix}`}, '', false, ${postReviewPreMigration}),
          (${`new-peer-${suffix}`}, ${`covers/${suffix}/shared`}, false, ${freshReviewedAt})`;
        await tx.$executeRaw`INSERT INTO "Revision" ("id", "projectId") VALUES (${`revision-row-${suffix}`}, ${`revision-${suffix}`})`;
        await tx.$executeRaw`INSERT INTO "Report" ("id", "projectId", "revisionId", "reason", "details", "status", "reviewedBy", "reviewedAt") VALUES
          (${`old-report-${suffix}`}, ${`old-direct-${suffix}`}, NULL, 'Old direct reason', 'Old direct details', 'RESOLVED', 'old-moderator', ${oldReviewedAt}),
          (${`fresh-report-${suffix}`}, ${`fresh-${suffix}`}, NULL, 'Fresh reason', 'Fresh details', 'RESOLVED', 'fresh-moderator', ${freshReviewedAt}),
          (${`evented-report-${suffix}`}, ${`evented-${suffix}`}, NULL, 'Already audited reason', 'Already audited details', 'RESOLVED', 'evented-moderator', ${oldReviewedAt}),
          (${`revision-report-${suffix}`}, NULL, ${`revision-row-${suffix}`}, 'Revision reason', 'Revision details', 'RESOLVED', NULL, ${oldReviewedAt}),
          (${`blank-report-${suffix}`}, ${`blank-target-${suffix}`}, NULL, 'Blank cover reason', 'Blank cover details', 'RESOLVED', 'blank-moderator', ${oldReviewedAt}),
          (${`existing-hold-report-${suffix}`}, ${`existing-hold-${suffix}`}, NULL, 'Existing hold reason', 'Existing hold details', 'RESOLVED', 'existing-moderator', ${existingHoldReviewedAt})`;
        await executeSql(tx, scopeMigrationSql);
        await executeSql(tx, retentionMigrationSql);
        await tx.$executeRaw`INSERT INTO "ModerationProjectHold" ("projectId", "wasPublic", "active", "reportId", "hiddenById") VALUES (${`existing-hold-${suffix}`}, false, false, 'previous-hold', 'previous-moderator')`;
        await tx.$executeRaw`INSERT INTO "ModerationEvent" ("id", "action", "reportId", "actorId") VALUES ('source-event', 'REVIEW', ${`evented-report-${suffix}`}, 'evented-moderator')`;

        await executeSql(tx, legacyMigrationSql);
        await executeSql(tx, legacyMigrationSql);

        const holds = await tx.$queryRawUnsafe<Array<{ projectId: string; wasPublic: boolean; active: boolean; reportId: string }>>(`SELECT "projectId", "wasPublic", "active", "reportId" FROM "ModerationProjectHold" ORDER BY "projectId"`);
        const events = await tx.$queryRawUnsafe<Array<{ id: string; action: string; reportId: string; projectId: string; actorId: string; reportReason: string; reportDetails: string; resolutionNote: string }>>(`SELECT "id", "action", "reportId", "projectId", "actorId", "reportReason", "reportDetails", "resolutionNote" FROM "ModerationEvent" WHERE "action" = 'LEGACY_REVIEW_HOLD' ORDER BY "projectId"`);
        const migratedProjectIds = holds.filter((hold) => hold.reportId.startsWith("legacy-hide:")).map((hold) => hold.projectId).sort();
        expect(migratedProjectIds).toEqual([
          `blank-peer-${suffix}`,
          `blank-target-${suffix}`,
          `old-direct-${suffix}`,
          `old-fork-${suffix}`,
          `revision-${suffix}`,
        ]);
        expect(holds.find((hold) => hold.projectId === `old-direct-${suffix}`)).toMatchObject({ wasPublic: false, active: true, reportId: `legacy-hide:old-direct-${suffix}` });
        expect(holds.find((hold) => hold.projectId === `existing-hold-${suffix}`)).toMatchObject({ active: false, reportId: "previous-hold" });
        expect(events).toHaveLength(5);
        expect(events).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: `legacy-hide:old-direct-${suffix}`, action: "LEGACY_REVIEW_HOLD", reportId: `legacy-hide:old-direct-${suffix}`, projectId: `old-direct-${suffix}`, actorId: "legacy-migration", reportReason: "Old direct reason", reportDetails: "Old direct details", resolutionNote: expect.stringContaining(`Original report: old-report-${suffix}`) }),
          expect.objectContaining({ id: `legacy-hide:old-fork-${suffix}`, projectId: `old-fork-${suffix}`, reportReason: "Old direct reason", reportDetails: "Old direct details", resolutionNote: expect.stringContaining(`original cover: covers/${suffix}/shared`) }),
          expect.objectContaining({ id: `legacy-hide:revision-${suffix}`, projectId: `revision-${suffix}`, actorId: "legacy-migration", reportReason: "Revision reason", reportDetails: "Revision details", resolutionNote: expect.stringContaining("original reviewer: unknown") }),
          expect.objectContaining({ id: `legacy-hide:blank-peer-${suffix}`, projectId: `blank-peer-${suffix}`, reportReason: "Blank cover reason", reportDetails: "Blank cover details", resolutionNote: expect.stringContaining("original cover: ") }),
        ]));
        expect(holds.some((hold) => hold.projectId === `post-review-peer-${suffix}` || hold.projectId === `post-review-blank-${suffix}` || hold.projectId === `new-peer-${suffix}` || hold.projectId === `fresh-${suffix}` || hold.projectId === `evented-${suffix}` || hold.projectId === `unrelated-${suffix}` || hold.projectId === `public-peer-${suffix}` || hold.projectId === `blank-public-${suffix}`)).toBe(false);
        expect(await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM "ModerationAssetBlock"`)).toEqual([{ count: BigInt(0) }]);
      }, { timeout: 120_000 });
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  });
});
