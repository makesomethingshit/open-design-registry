-- Discovery metadata is optional for historical revisions and immutable once published.
ALTER TABLE "Revision"
  ADD COLUMN "tool" TEXT,
  ADD COLUMN "toolVersion" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "sourceChecksum" TEXT;

ALTER TABLE "Revision"
  ADD CONSTRAINT "Revision_tool_non_empty"
    CHECK ("tool" IS NULL OR btrim("tool") <> ''),
  ADD CONSTRAINT "Revision_toolVersion_non_empty"
    CHECK ("toolVersion" IS NULL OR btrim("toolVersion") <> ''),
  ADD CONSTRAINT "Revision_sourceChecksum_sha256"
    CHECK ("sourceChecksum" IS NULL OR "sourceChecksum" ~ '^[0-9a-fA-F]{64}$'),
  ADD CONSTRAINT "Revision_tags_limit"
    CHECK (cardinality("tags") <= 20);

CREATE INDEX "Revision_tool_createdAt_idx" ON "Revision"("tool", "createdAt");
CREATE INDEX "Revision_sourceChecksum_idx" ON "Revision"("sourceChecksum");
CREATE INDEX "Revision_tags_idx" ON "Revision" USING GIN ("tags");

-- Include discovery metadata in the published-row immutability comparison.
DROP TRIGGER IF EXISTS "Revision_immutable" ON "Revision";

CREATE OR REPLACE FUNCTION prevent_revision_publish() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."isPublished" IS FALSE
     AND NEW."isPublished" IS TRUE
     AND ROW(
       OLD."id", OLD."projectId", OLD."number", OLD."parentId",
       OLD."title", OLD."changeDescription", OLD."sourceKey", OLD."sourceUrl",
       OLD."tool", OLD."toolVersion", OLD."tags", OLD."sourceChecksum", OLD."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       NEW."id", NEW."projectId", NEW."number", NEW."parentId",
       NEW."title", NEW."changeDescription", NEW."sourceKey", NEW."sourceUrl",
       NEW."tool", NEW."toolVersion", NEW."tags", NEW."sourceChecksum", NEW."createdAt"
     )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'published revisions and previews are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Revision_immutable"
  BEFORE UPDATE OR DELETE ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_publish();
