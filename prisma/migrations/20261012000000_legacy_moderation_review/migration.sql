-- Preserve only currently private projects that the legacy cover-wide hide could have affected.
-- The old updateMany also matched an empty coverUrl. Keep that behavior for private blank-cover
-- rows because it is impossible to distinguish a real shared blank value from an unrelated one.
-- wasPublic is deliberately false: the legacy hide did not record the prior visibility.
WITH scope_migration AS (
  SELECT MIN("started_at") AS "startedAt"
  FROM "_prisma_migrations"
  WHERE "migration_name" = '20261010000000_moderation_asset_scope'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL
), legacy_reports AS (
  SELECT
    r."id" AS "reportId",
    r."reason" AS "reportReason",
    r."details" AS "reportDetails",
    r."reviewedBy" AS "reviewedBy",
    r."reviewedAt" AS "reviewedAt",
    target."id" AS "targetProjectId",
    target."coverUrl" AS "targetCoverUrl",
    scope_migration."startedAt" AS "scopeStartedAt"
  FROM "Report" r
  LEFT JOIN "Revision" revision ON revision."id" = r."revisionId"
  JOIN "Project" target ON target."id" = COALESCE(r."projectId", revision."projectId")
  CROSS JOIN scope_migration
  WHERE r."status" = 'RESOLVED'
    AND r."reviewedAt" IS NOT NULL
    AND scope_migration."startedAt" IS NOT NULL
    AND r."reviewedAt" < scope_migration."startedAt"
    AND NOT EXISTS (
      SELECT 1
      FROM "ModerationEvent" existing_event
      WHERE existing_event."reportId" = r."id"
    )
), ranked_candidates AS (
  SELECT
    project."id" AS "projectId",
    legacy_reports."reportId",
    legacy_reports."reportReason",
    legacy_reports."reportDetails",
    legacy_reports."reviewedBy",
    legacy_reports."reviewedAt",
    legacy_reports."targetCoverUrl",
    ROW_NUMBER() OVER (
      PARTITION BY project."id"
      ORDER BY legacy_reports."reviewedAt", legacy_reports."reportId"
    ) AS "rank"
  FROM "Project" project
  JOIN legacy_reports
    ON legacy_reports."targetProjectId" = project."id"
    OR legacy_reports."targetCoverUrl" = project."coverUrl"
  WHERE project."isPublic" = false
    AND project."createdAt" < legacy_reports."scopeStartedAt"
    AND NOT EXISTS (
      SELECT 1
      FROM "ModerationProjectHold" existing_hold
      WHERE existing_hold."projectId" = project."id"
    )
), candidates AS (
  SELECT *
  FROM ranked_candidates
  WHERE "rank" = 1
), inserted_holds AS (
  INSERT INTO "ModerationProjectHold" (
    "projectId", "wasPublic", "active", "reportId", "hiddenById", "hiddenAt"
  )
  SELECT
    candidates."projectId",
    false,
    true,
    'legacy-hide:' || candidates."projectId",
    'legacy-migration',
    candidates."reviewedAt"
  FROM candidates
  ON CONFLICT ("projectId") DO NOTHING
  RETURNING "projectId", "reportId"
)
INSERT INTO "ModerationEvent" (
  "id", "action", "reportId", "projectId", "actorId",
  "reportReason", "reportDetails", "resolutionNote"
)
SELECT
  'legacy-hide:' || candidates."projectId",
  'LEGACY_REVIEW_HOLD',
  inserted_holds."reportId",
  candidates."projectId",
  'legacy-migration',
  candidates."reportReason",
  candidates."reportDetails",
  'Inferred from legacy cover-wide hiding. Original report: ' || candidates."reportId" || '; original cover: ' || candidates."targetCoverUrl" || '; original reviewer: ' || COALESCE(candidates."reviewedBy", 'unknown') || '. The legacy hide did not record the project''s original public state; this retained hold preserves the current private state until an administrator reviews it.'
FROM inserted_holds
JOIN candidates ON candidates."projectId" = inserted_holds."projectId"
ON CONFLICT ("id") DO NOTHING;
