ALTER TABLE "Release" ADD COLUMN "requestId" UUID;

CREATE UNIQUE INDEX "Release_projectId_publishedById_requestId_key" ON "Release"("projectId", "publishedById", "requestId");
