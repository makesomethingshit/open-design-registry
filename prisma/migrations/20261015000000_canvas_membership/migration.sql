-- Foundation only. API/UI state transitions and transactional ACL are follow-up work in this draft.
CREATE TYPE "CanvasAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

CREATE TABLE "ProjectCanvas" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "accessStatus" "CanvasAccessStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "firstApprovedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectCanvas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectCanvas_projectId_ownerId_key" ON "ProjectCanvas"("projectId", "ownerId");
CREATE INDEX "ProjectCanvas_projectId_accessStatus_idx" ON "ProjectCanvas"("projectId", "accessStatus");
CREATE INDEX "ProjectCanvas_ownerId_idx" ON "ProjectCanvas"("ownerId");
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
