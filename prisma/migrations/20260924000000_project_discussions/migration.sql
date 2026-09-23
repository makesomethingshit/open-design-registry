ALTER TYPE "NotificationType" ADD VALUE 'DISCUSSION_CREATED';

CREATE TABLE "Discussion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Discussion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionComment" (
  "id" TEXT NOT NULL,
  "discussionId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "discussionId" TEXT;

CREATE INDEX "Discussion_projectId_createdAt_idx" ON "Discussion"("projectId", "createdAt");
CREATE INDEX "Discussion_authorId_idx" ON "Discussion"("authorId");
CREATE INDEX "DiscussionComment_discussionId_createdAt_idx" ON "DiscussionComment"("discussionId", "createdAt");
CREATE INDEX "DiscussionComment_authorId_idx" ON "DiscussionComment"("authorId");
CREATE INDEX "Notification_discussionId_idx" ON "Notification"("discussionId");

ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
