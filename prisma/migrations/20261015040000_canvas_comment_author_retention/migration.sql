ALTER TABLE "CanvasItemComment" DROP CONSTRAINT "CanvasItemComment_authorId_fkey";
ALTER TABLE "CanvasItemComment" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "CanvasItemComment" ADD CONSTRAINT "CanvasItemComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
