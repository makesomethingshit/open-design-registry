ALTER TABLE "Revision"
  ADD CONSTRAINT "Revision_source_xor"
  CHECK ((CASE WHEN "sourceKey" IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN "sourceUrl" IS NOT NULL THEN 1 ELSE 0 END) = 1);

CREATE OR REPLACE FUNCTION prevent_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'published revisions and previews are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Revision_immutable"
  BEFORE UPDATE OR DELETE ON "Revision"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();

CREATE TRIGGER "Preview_immutable"
  BEFORE UPDATE OR DELETE ON "Preview"
  FOR EACH ROW EXECUTE FUNCTION prevent_revision_mutation();
