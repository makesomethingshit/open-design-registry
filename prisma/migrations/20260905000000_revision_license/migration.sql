-- Historical publication licenses cannot be inferred from mutable Project.license.
-- Leave existing revisions NULL; new publications record the confirmed license.
-- The existing to_jsonb immutability trigger also protects this new column.
ALTER TABLE "Revision" ADD COLUMN "license" TEXT;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_license_non_empty"
  CHECK ("license" IS NULL OR btrim("license") <> '');
