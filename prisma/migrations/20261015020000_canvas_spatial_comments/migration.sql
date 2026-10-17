-- Canvas spatial/comment persistence contract; write/read APIs remain unimplemented.
ALTER TABLE "ProjectCanvas" ADD COLUMN "layoutVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CanvasItem"
  ADD COLUMN "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "width" DOUBLE PRECISION NOT NULL DEFAULT 320,
  ADD COLUMN "height" DOUBLE PRECISION NOT NULL DEFAULT 240,
  ADD COLUMN "zIndex" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "CanvasItem_canvasId_archivedAt_zIndex_id_idx" ON "CanvasItem"("canvasId", "archivedAt", "zIndex", "id");

CREATE TABLE "CanvasItemComment" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanvasItemComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CanvasItemComment_itemId_createdAt_id_idx" ON "CanvasItemComment"("itemId", "createdAt", "id");
CREATE INDEX "CanvasItemComment_authorId_idx" ON "CanvasItemComment"("authorId");
ALTER TABLE "CanvasItemComment" ADD CONSTRAINT "CanvasItemComment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CanvasItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CanvasItemComment" ADD CONSTRAINT "CanvasItemComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
