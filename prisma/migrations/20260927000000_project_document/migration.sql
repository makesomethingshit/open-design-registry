-- Add independent long-form project document (README-type), kept separate from short description.
ALTER TABLE "Project" ADD COLUMN "document" TEXT NOT NULL DEFAULT '';
