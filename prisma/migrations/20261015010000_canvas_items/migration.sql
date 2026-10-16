-- Scaffold only. Routes must validate kind/content and generate asset keys server-side.
CREATE TYPE "CanvasItemKind" AS ENUM ('IMAGE', 'TEXT');
CREATE TYPE "CanvasItemOrigin" AS ENUM ('ORIGINAL', 'REFERENCE');

CREATE TABLE "CanvasItem" (
  "id" TEXT NOT NULL,
  "canvasId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "kind" "CanvasItemKind" NOT NULL,
  "origin" "CanvasItemOrigin" NOT NULL DEFAULT 'ORIGINAL',
  "body" TEXT,
  "assetKey" TEXT,
  "altText" TEXT,
  "sourceUrl" TEXT,
  "rightsNote" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CanvasItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CanvasItem_canvasId_archivedAt_sortOrder_id_idx" ON "CanvasItem"("canvasId", "archivedAt", "sortOrder", "id");
CREATE INDEX "CanvasItem_authorId_idx" ON "CanvasItem"("authorId");
CREATE INDEX "CanvasItem_assetKey_idx" ON "CanvasItem"("assetKey");
ALTER TABLE "CanvasItem" ADD CONSTRAINT "CanvasItem_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasItem" ADD CONSTRAINT "CanvasItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
