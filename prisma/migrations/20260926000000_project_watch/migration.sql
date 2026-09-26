ALTER TYPE "NotificationType" ADD VALUE 'REVISION_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'RELEASE_PUBLISHED';

CREATE TABLE "ProjectWatch" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectWatch_pkey" PRIMARY KEY ("userId", "projectId")
);

CREATE INDEX "ProjectWatch_userId_createdAt_idx" ON "ProjectWatch"("userId", "createdAt");
CREATE INDEX "ProjectWatch_projectId_idx" ON "ProjectWatch"("projectId");

ALTER TABLE "ProjectWatch" ADD CONSTRAINT "ProjectWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWatch" ADD CONSTRAINT "ProjectWatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD COLUMN "revisionId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "releaseId" TEXT;

CREATE INDEX "Notification_revisionId_idx" ON "Notification"("revisionId");
CREATE INDEX "Notification_releaseId_idx" ON "Notification"("releaseId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
