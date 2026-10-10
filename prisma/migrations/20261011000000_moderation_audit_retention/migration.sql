ALTER TABLE "ModerationEvent"
  ADD COLUMN "reportReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "reportDetails" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "resolutionNote" TEXT NOT NULL DEFAULT '';

-- A current resolution note may belong to a later re-block; do not invent historical notes.
UPDATE "ModerationEvent" e SET
  "reportReason" = r."reason", "reportDetails" = r."details"
FROM "Report" r WHERE r.id = e."reportId";

CREATE INDEX "ModerationProjectHold_reportId_active_idx" ON "ModerationProjectHold"("reportId", "active");
CREATE INDEX "ModerationAssetBlock_reportId_blocked_idx" ON "ModerationAssetBlock"("reportId", "blocked");
