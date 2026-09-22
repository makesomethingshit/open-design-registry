ALTER TABLE "Revision" ADD COLUMN "publishedById" TEXT;

CREATE INDEX "Revision_publishedById_idx" ON "Revision"("publishedById");

ALTER TABLE "Revision"
ADD CONSTRAINT "Revision_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
