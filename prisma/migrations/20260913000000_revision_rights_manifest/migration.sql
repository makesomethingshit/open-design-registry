CREATE TYPE "RightsPermission" AS ENUM ('UNKNOWN', 'ALLOWED', 'RESTRICTED', 'NOT_ALLOWED');
CREATE TYPE "SourceRightsMode" AS ENUM ('SAME_AS_REVISION', 'SEPARATE', 'UNKNOWN');
CREATE TYPE "RightsItemType" AS ENUM ('SOURCE_FILE', 'FONT', 'IMAGE', 'ILLUSTRATION', 'ICON', 'TEMPLATE', 'OTHER');

CREATE TABLE "RevisionRightsDeclaration" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "sourceRightsMode" "SourceRightsMode" NOT NULL,
  "sourceLicenseName" TEXT,
  "sourceLicenseUrl" TEXT,
  "sourceRightsHolder" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersedesId" TEXT,
  CONSTRAINT "RevisionRightsDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionRightsDeclaration_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RevisionRightsDeclaration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionRightsDeclaration_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "RevisionRightsDeclaration"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RevisionRightsDeclaration_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "RevisionRightsItem" (
  "id" TEXT NOT NULL,
  "declarationId" TEXT NOT NULL,
  "type" "RightsItemType" NOT NULL,
  "name" TEXT NOT NULL,
  "sourceFileId" TEXT,
  "rightsHolder" TEXT,
  "licenseName" TEXT,
  "licenseUrl" TEXT,
  "sourceUrl" TEXT,
  "redistribution" "RightsPermission" NOT NULL DEFAULT 'UNKNOWN',
  "derivativeUse" "RightsPermission" NOT NULL DEFAULT 'UNKNOWN',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionRightsItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionRightsItem_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "RevisionRightsDeclaration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RevisionRightsItem_name_non_empty" CHECK (btrim("name") <> '')
);

CREATE UNIQUE INDEX "RevisionRightsDeclaration_revisionId_version_key" ON "RevisionRightsDeclaration"("revisionId", "version");
CREATE INDEX "RevisionRightsDeclaration_revisionId_createdAt_idx" ON "RevisionRightsDeclaration"("revisionId", "createdAt");
CREATE INDEX "RevisionRightsDeclaration_createdById_idx" ON "RevisionRightsDeclaration"("createdById");
CREATE INDEX "RevisionRightsDeclaration_supersedesId_idx" ON "RevisionRightsDeclaration"("supersedesId");
CREATE INDEX "RevisionRightsItem_declarationId_idx" ON "RevisionRightsItem"("declarationId");
CREATE INDEX "RevisionRightsItem_sourceFileId_idx" ON "RevisionRightsItem"("sourceFileId");

CREATE OR REPLACE FUNCTION prevent_rights_manifest_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rights declarations are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RevisionRightsDeclaration_append_only"
  BEFORE UPDATE OR DELETE ON "RevisionRightsDeclaration"
  FOR EACH ROW EXECUTE FUNCTION prevent_rights_manifest_mutation();

CREATE TRIGGER "RevisionRightsItem_append_only"
  BEFORE UPDATE OR DELETE ON "RevisionRightsItem"
  FOR EACH ROW EXECUTE FUNCTION prevent_rights_manifest_mutation();
