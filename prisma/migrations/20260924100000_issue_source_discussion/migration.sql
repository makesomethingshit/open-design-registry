ALTER TABLE "Issue"
ADD COLUMN "sourceDiscussionId" TEXT;

CREATE INDEX "Issue_sourceDiscussionId_idx"
ON "Issue"("sourceDiscussionId");

ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_sourceDiscussionId_fkey"
FOREIGN KEY ("sourceDiscussionId")
REFERENCES "Discussion"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
