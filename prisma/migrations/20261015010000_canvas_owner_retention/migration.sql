ALTER TABLE "ProjectCanvas" DROP CONSTRAINT "ProjectCanvas_ownerId_fkey";
ALTER TABLE "ProjectCanvas" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
