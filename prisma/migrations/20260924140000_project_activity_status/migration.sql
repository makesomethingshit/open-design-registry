CREATE TYPE "ProjectActivityStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

ALTER TABLE "Project"
ADD COLUMN "activityStatus" "ProjectActivityStatus" NOT NULL DEFAULT 'ACTIVE';
