ALTER TABLE "Preview" ADD COLUMN "position" INTEGER;

-- The immutable trigger protects published rows; suspend it only while
-- assigning the deterministic legacy order during this schema migration.
DROP TRIGGER IF EXISTS "Preview_immutable" ON "Preview";
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "revisionId" ORDER BY "createdAt", "id") - 1 AS "position"
  FROM "Preview"
)
UPDATE "Preview" AS preview
SET "position" = ranked."position"
FROM ranked
WHERE preview."id" = ranked."id";
ALTER TABLE "Preview" ALTER COLUMN "position" SET DEFAULT 0;
ALTER TABLE "Preview" ALTER COLUMN "position" SET NOT NULL;

CREATE INDEX "Preview_revisionId_position_idx" ON "Preview"("revisionId", "position");

CREATE TRIGGER "Preview_immutable"
  BEFORE UPDATE OR DELETE ON "Preview"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();
