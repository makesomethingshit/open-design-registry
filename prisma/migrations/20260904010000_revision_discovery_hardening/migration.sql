-- Canonicalize discovery metadata and make publication immutability fail closed.
DROP TRIGGER IF EXISTS "Revision_immutable" ON "Revision";

UPDATE "Revision"
SET "tool" = lower(btrim("tool")),
    "toolVersion" = btrim("toolVersion"),
    "sourceChecksum" = lower("sourceChecksum")
WHERE "tool" IS NOT NULL OR "toolVersion" IS NOT NULL OR "sourceChecksum" IS NOT NULL;

ALTER TABLE "Revision"
  DROP CONSTRAINT IF EXISTS "Revision_tool_non_empty",
  DROP CONSTRAINT IF EXISTS "Revision_sourceChecksum_sha256",
  ADD CONSTRAINT "Revision_tool_non_empty"
    CHECK ("tool" IS NULL OR (btrim("tool") <> '' AND "tool" = lower("tool"))),
  ADD CONSTRAINT "Revision_sourceChecksum_sha256"
    CHECK ("sourceChecksum" IS NULL OR "sourceChecksum" ~ '^[0-9a-f]{64}$');

DROP INDEX IF EXISTS "Revision_sourceChecksum_idx";

CREATE OR REPLACE FUNCTION prevent_revision_publish() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."isPublished" IS FALSE
     AND NEW."isPublished" IS TRUE
     AND (to_jsonb(OLD) - 'isPublished') IS NOT DISTINCT FROM (to_jsonb(NEW) - 'isPublished')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'published revisions and previews are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Revision_immutable"
  BEFORE UPDATE OR DELETE ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_publish();
