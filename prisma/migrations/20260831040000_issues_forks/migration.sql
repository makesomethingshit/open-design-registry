CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "Project" ADD COLUMN "forkedFromProjectId" TEXT,
ADD COLUMN "forkedFromRevisionId" TEXT,
ADD COLUMN "forkedFromLicense" TEXT;

CREATE TABLE "Issue" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "revisionId" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IssueComment" (
  "id" TEXT NOT NULL,
  "issueId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IssueComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Project_forkedFromProjectId_idx" ON "Project"("forkedFromProjectId");
CREATE INDEX "Project_forkedFromRevisionId_idx" ON "Project"("forkedFromRevisionId");
CREATE INDEX "Issue_projectId_status_createdAt_idx" ON "Issue"("projectId", "status", "createdAt");
CREATE INDEX "Issue_authorId_idx" ON "Issue"("authorId");
CREATE INDEX "Issue_revisionId_idx" ON "Issue"("revisionId");
CREATE INDEX "IssueComment_issueId_createdAt_idx" ON "IssueComment"("issueId", "createdAt");
CREATE INDEX "IssueComment_authorId_idx" ON "IssueComment"("authorId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_forkedFromProjectId_fkey" FOREIGN KEY ("forkedFromProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_forkedFromRevisionId_fkey" FOREIGN KEY ("forkedFromRevisionId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IssueComment" ADD CONSTRAINT "IssueComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
