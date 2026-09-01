CREATE TYPE "NotificationType" AS ENUM ('ISSUE_CREATED', 'FORK_CREATED');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "projectId" TEXT NOT NULL,
  "issueId" TEXT,
  "forkedProjectId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");
CREATE INDEX "Notification_issueId_idx" ON "Notification"("issueId");
CREATE INDEX "Notification_forkedProjectId_idx" ON "Notification"("forkedProjectId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_forkedProjectId_fkey" FOREIGN KEY ("forkedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
