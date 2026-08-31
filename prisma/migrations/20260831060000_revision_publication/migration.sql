-- Existing revisions are already published. New publishes stage their row as
-- unpublished, insert all previews in the same transaction, then publish it.
ALTER TABLE "Revision"
  ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;

DROP TRIGGER IF EXISTS "Revision_immutable" ON "Revision";

CREATE OR REPLACE FUNCTION prevent_revision_publish() RETURNS trigger AS $$
BEGIN
  -- The only allowed revision update is the atomic unpublished -> published
  -- transition; every other revision field must remain byte-for-byte stable.
  IF TG_OP = 'UPDATE'
     AND OLD."isPublished" IS FALSE
     AND NEW."isPublished" IS TRUE
     AND ROW(
       OLD."id", OLD."projectId", OLD."number", OLD."parentId",
       OLD."title", OLD."changeDescription", OLD."sourceKey", OLD."sourceUrl", OLD."createdAt"
     ) IS NOT DISTINCT FROM ROW(
       NEW."id", NEW."projectId", NEW."number", NEW."parentId",
       NEW."title", NEW."changeDescription", NEW."sourceKey", NEW."sourceUrl", NEW."createdAt"
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

CREATE OR REPLACE FUNCTION prevent_published_preview_insert() RETURNS trigger AS $$
DECLARE
  revision_published BOOLEAN;
BEGIN
  -- Lock the parent while checking it so a publish transition and a concurrent
  -- preview insert cannot pass this check in opposite directions.
  SELECT "isPublished" INTO revision_published
  FROM "Revision"
  WHERE "id" = NEW."revisionId"
  FOR UPDATE;
  IF revision_published IS TRUE THEN
    RAISE EXCEPTION 'published revisions and previews are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Preview_immutable_insert"
  BEFORE INSERT ON "Preview"
  FOR EACH ROW EXECUTE FUNCTION prevent_published_preview_insert();
