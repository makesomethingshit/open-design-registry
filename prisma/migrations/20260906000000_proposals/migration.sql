CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'OPEN', 'CHANGES_REQUESTED', 'APPROVED', 'PARTIALLY_ACCEPTED', 'ACCEPTED', 'CLOSED');
CREATE TYPE "ChangeType" AS ENUM ('REPLACE_DOCUMENT', 'REPLACE_ASSET', 'ADD_UNIT', 'MODIFY_UNIT', 'REMOVE_UNIT', 'RENAME_UNIT');
CREATE TYPE "ChangeReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');

CREATE TABLE "Proposal" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "baseRevisionId" TEXT NOT NULL,
  "sourceRevisionId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "relatedIssueId" TEXT,
  "reviewerId" TEXT,
  "acceptedById" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "ProposalStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChangeSet" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangeSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Change" (
  "id" TEXT NOT NULL,
  "changeSetId" TEXT NOT NULL,
  "type" "ChangeType" NOT NULL,
  "target" TEXT NOT NULL,
  "reviewStatus" "ChangeReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewComment" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposalComment" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProposalComment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Revision" ADD COLUMN "sourceProposalId" TEXT;

CREATE UNIQUE INDEX "Revision_sourceProposalId_key" ON "Revision"("sourceProposalId");
CREATE UNIQUE INDEX "ChangeSet_proposalId_key" ON "ChangeSet"("proposalId");
CREATE INDEX "Proposal_projectId_status_createdAt_idx" ON "Proposal"("projectId", "status", "createdAt");
CREATE INDEX "Proposal_baseRevisionId_idx" ON "Proposal"("baseRevisionId");
CREATE INDEX "Proposal_sourceRevisionId_idx" ON "Proposal"("sourceRevisionId");
CREATE INDEX "Proposal_authorId_idx" ON "Proposal"("authorId");
CREATE INDEX "Proposal_relatedIssueId_idx" ON "Proposal"("relatedIssueId");
CREATE INDEX "Change_changeSetId_idx" ON "Change"("changeSetId");
CREATE INDEX "Change_reviewedById_idx" ON "Change"("reviewedById");
CREATE INDEX "ProposalComment_proposalId_createdAt_idx" ON "ProposalComment"("proposalId", "createdAt");
CREATE INDEX "ProposalComment_authorId_idx" ON "ProposalComment"("authorId");

ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "Revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_sourceRevisionId_fkey" FOREIGN KEY ("sourceRevisionId") REFERENCES "Revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_relatedIssueId_fkey" FOREIGN KEY ("relatedIssueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Change" ADD CONSTRAINT "Change_changeSetId_fkey" FOREIGN KEY ("changeSetId") REFERENCES "ChangeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Change" ADD CONSTRAINT "Change_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposalComment" ADD CONSTRAINT "ProposalComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
