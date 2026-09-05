-- Keep v0.1 proposals readable while allowing a proposal to produce multiple
-- selective-application revisions.
DROP INDEX "Revision_sourceProposalId_key";

ALTER TABLE "Change"
  ADD COLUMN "targetFileId" TEXT,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "size" INTEGER,
  ADD COLUMN "assetKey" TEXT,
  ADD COLUMN "appliedRevisionId" TEXT;

CREATE INDEX "Change_appliedRevisionId_idx" ON "Change"("appliedRevisionId");

CREATE TABLE "ChangeReview" (
  "id" TEXT NOT NULL,
  "changeId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "status" "ChangeReviewStatus" NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangeReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeReview_changeId_createdAt_idx" ON "ChangeReview"("changeId", "createdAt");
CREATE INDEX "ChangeReview_authorId_idx" ON "ChangeReview"("authorId");

ALTER TABLE "Change"
  ADD CONSTRAINT "Change_appliedRevisionId_fkey"
  FOREIGN KEY ("appliedRevisionId") REFERENCES "Revision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChangeReview"
  ADD CONSTRAINT "ChangeReview_changeId_fkey"
  FOREIGN KEY ("changeId") REFERENCES "Change"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChangeReview"
  ADD CONSTRAINT "ChangeReview_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
