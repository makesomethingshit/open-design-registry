-- Existing revisions are immutable, so pause the triggers while backfilling
-- the new required metadata before restoring the same protection.
DROP TRIGGER IF EXISTS "Revision_immutable" ON "Revision";
DROP TRIGGER IF EXISTS "Preview_immutable" ON "Preview";

ALTER TABLE "Revision" ADD COLUMN "title" TEXT;
UPDATE "Revision"
SET "title" = 'Revision ' || "number"
WHERE "title" IS NULL OR btrim("title") = '';
UPDATE "Revision"
SET "changeDescription" = 'No change description provided.'
WHERE btrim("changeDescription") = '';
ALTER TABLE "Revision" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "Revision" ALTER COLUMN "changeDescription" DROP DEFAULT;

ALTER TABLE "Preview" ADD COLUMN "altText" TEXT;
UPDATE "Preview"
SET "altText" = 'Preview ' || ("position" + 1)
WHERE "altText" IS NULL OR btrim("altText") = '';
ALTER TABLE "Preview" ALTER COLUMN "altText" SET NOT NULL;

ALTER TABLE "Revision"
  ADD CONSTRAINT "Revision_title_non_empty" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "Revision_changeDescription_non_empty" CHECK (btrim("changeDescription") <> '');
ALTER TABLE "Preview"
  ADD CONSTRAINT "Preview_altText_non_empty" CHECK (btrim("altText") <> '');

CREATE TRIGGER "Revision_immutable"
  BEFORE UPDATE OR DELETE ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();

CREATE TRIGGER "Preview_immutable"
  BEFORE UPDATE OR DELETE ON "Preview"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();
