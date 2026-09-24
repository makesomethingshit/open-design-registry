CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseRevision" (
    "releaseId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ReleaseRevision_pkey" PRIMARY KEY ("releaseId", "revisionId")
);

CREATE UNIQUE INDEX "Release_projectId_number_key" ON "Release"("projectId", "number");
CREATE INDEX "Release_projectId_createdAt_idx" ON "Release"("projectId", "createdAt");
CREATE INDEX "Release_publishedById_idx" ON "Release"("publishedById");
CREATE UNIQUE INDEX "ReleaseRevision_releaseId_position_key" ON "ReleaseRevision"("releaseId", "position");
CREATE INDEX "ReleaseRevision_revisionId_idx" ON "ReleaseRevision"("revisionId");

ALTER TABLE "Release"
ADD CONSTRAINT "Release_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Release"
ADD CONSTRAINT "Release_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReleaseRevision"
ADD CONSTRAINT "ReleaseRevision_releaseId_fkey"
FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReleaseRevision"
ADD CONSTRAINT "ReleaseRevision_revisionId_fkey"
FOREIGN KEY ("revisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
