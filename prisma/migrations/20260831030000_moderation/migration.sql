ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Project" ADD COLUMN "publicationConfirmedAt" TIMESTAMP(3), ADD COLUMN "publicationConfirmedBy" TEXT;

CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');
CREATE TABLE "Report" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "revisionId" TEXT,
  "reporterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '',
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Report_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Report_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Report_one_target_check" CHECK ((CASE WHEN "projectId" IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN "revisionId" IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_projectId_idx" ON "Report"("projectId");
CREATE INDEX "Report_revisionId_idx" ON "Report"("revisionId");
