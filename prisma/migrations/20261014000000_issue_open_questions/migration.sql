ALTER TABLE "Issue" ADD COLUMN "isOpenQuestion" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Issue_projectId_isOpenQuestion_status_createdAt_idx" ON "Issue"("projectId", "isOpenQuestion", "status", "createdAt");
