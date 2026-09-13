CREATE TYPE "ChangeReviewEventType" AS ENUM ('REVIEW', 'INVALIDATED_UPSTREAM', 'PARTIAL_APPLICATION_RESET');

ALTER TABLE "ChangeReview"
  DROP CONSTRAINT "ChangeReview_authorId_fkey",
  ALTER COLUMN "authorId" DROP NOT NULL,
  ADD COLUMN "eventType" "ChangeReviewEventType" NOT NULL DEFAULT 'REVIEW',
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "checkedLatestRevisionId" TEXT,
  ADD COLUMN "causedByRevisionId" TEXT;

ALTER TABLE "ChangeReview"
  ADD CONSTRAINT "ChangeReview_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ChangeReview_checkedLatestRevisionId_fkey"
  FOREIGN KEY ("checkedLatestRevisionId") REFERENCES "Revision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "ChangeReview_causedByRevisionId_fkey"
  FOREIGN KEY ("causedByRevisionId") REFERENCES "Revision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ChangeReview_checkedLatestRevisionId_idx" ON "ChangeReview"("checkedLatestRevisionId");
CREATE INDEX "ChangeReview_causedByRevisionId_idx" ON "ChangeReview"("causedByRevisionId");
CREATE UNIQUE INDEX "ChangeReview_changeId_eventType_causedByRevisionId_key" ON "ChangeReview"("changeId", "eventType", "causedByRevisionId");
