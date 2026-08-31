CREATE TABLE "Revision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "parentId" TEXT,
  "sourceKey" TEXT,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Revision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Revision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Revision_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Preview" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Preview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Preview_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Revision_projectId_number_key" ON "Revision"("projectId", "number");
CREATE INDEX "Revision_projectId_createdAt_idx" ON "Revision"("projectId", "createdAt");
CREATE INDEX "Revision_parentId_idx" ON "Revision"("parentId");
CREATE UNIQUE INDEX "Preview_revisionId_key_key" ON "Preview"("revisionId", "key");
CREATE INDEX "Preview_revisionId_idx" ON "Preview"("revisionId");

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
