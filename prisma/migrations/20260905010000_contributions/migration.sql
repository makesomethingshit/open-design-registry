-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('OPEN', 'CHANGES_REQUESTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContributionEventType" AS ENUM ('OPENED', 'COMMENTED', 'UPDATED', 'CHANGES_REQUESTED', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CONTRIBUTION_ACTIVITY';

-- AlterTable
ALTER TABLE "Revision" ADD COLUMN     "acceptedById" TEXT,
ADD COLUMN     "acceptedByName" TEXT,
ADD COLUMN     "acceptedContributionId" TEXT,
ADD COLUMN     "contributorId" TEXT,
ADD COLUMN     "contributorName" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "contributionId" TEXT;

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceProjectId" TEXT NOT NULL,
    "sourceProjectTitle" TEXT NOT NULL,
    "sourceProjectSlug" TEXT NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "proposedRevisionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionEvent" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "type" "ContributionEventType" NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "proposedRevisionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contribution_projectId_createdAt_id_idx" ON "Contribution"("projectId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Contribution_sourceProjectId_idx" ON "Contribution"("sourceProjectId");

-- CreateIndex
CREATE INDEX "Contribution_authorId_idx" ON "Contribution"("authorId");

-- CreateIndex
CREATE INDEX "Contribution_baseRevisionId_idx" ON "Contribution"("baseRevisionId");

-- CreateIndex
CREATE INDEX "Contribution_proposedRevisionId_idx" ON "Contribution"("proposedRevisionId");

-- CreateIndex
CREATE INDEX "ContributionEvent_contributionId_createdAt_id_idx" ON "ContributionEvent"("contributionId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ContributionEvent_actorId_idx" ON "ContributionEvent"("actorId");

-- CreateIndex
CREATE INDEX "ContributionEvent_baseRevisionId_idx" ON "ContributionEvent"("baseRevisionId");

-- CreateIndex
CREATE INDEX "ContributionEvent_proposedRevisionId_idx" ON "ContributionEvent"("proposedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_acceptedContributionId_key" ON "Revision"("acceptedContributionId");

-- CreateIndex
CREATE INDEX "Notification_contributionId_idx" ON "Notification"("contributionId");

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_acceptedContributionId_fkey" FOREIGN KEY ("acceptedContributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_proposedRevisionId_fkey" FOREIGN KEY ("proposedRevisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEvent" ADD CONSTRAINT "ContributionEvent_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "Contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEvent" ADD CONSTRAINT "ContributionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEvent" ADD CONSTRAINT "ContributionEvent_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionEvent" ADD CONSTRAINT "ContributionEvent_proposedRevisionId_fkey" FOREIGN KEY ("proposedRevisionId") REFERENCES "Revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A review record keeps its original identity; only its candidate/base and state evolve.
CREATE FUNCTION validate_contribution_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contribution history is permanent';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('ACCEPTED', 'REJECTED')
       OR NEW.version <> OLD.version + 1
       OR (to_jsonb(OLD) - ARRAY['baseRevisionId','proposedRevisionId','status','version','updatedAt'])
          IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['baseRevisionId','proposedRevisionId','status','version','updatedAt'])
       OR (OLD.status = 'CHANGES_REQUESTED' AND NEW.status = 'ACCEPTED') THEN
      RAISE EXCEPTION 'invalid contribution history transition';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Revision" WHERE id = NEW."baseRevisionId" AND "projectId" = NEW."projectId" AND "isPublished")
     OR NOT EXISTS (SELECT 1 FROM "Revision" WHERE id = NEW."proposedRevisionId" AND "projectId" = NEW."sourceProjectId" AND "isPublished") THEN
    RAISE EXCEPTION 'contribution revisions must belong to the recorded projects';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Contribution_history" BEFORE INSERT OR UPDATE OR DELETE ON "Contribution"
  FOR EACH ROW EXECUTE FUNCTION validate_contribution_history();

CREATE FUNCTION prevent_contribution_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contribution review events are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ContributionEvent_immutable" BEFORE UPDATE OR DELETE ON "ContributionEvent"
  FOR EACH ROW EXECUTE FUNCTION prevent_contribution_event_mutation();

ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_different_projects" CHECK ("projectId" <> "sourceProjectId");
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_positive_version" CHECK (version > 0);
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_contribution_attribution" CHECK (
  ("acceptedContributionId" IS NULL AND "contributorId" IS NULL AND "contributorName" IS NULL AND "acceptedById" IS NULL AND "acceptedByName" IS NULL)
  OR ("acceptedContributionId" IS NOT NULL AND "contributorId" IS NOT NULL AND "contributorName" IS NOT NULL AND "acceptedById" IS NOT NULL AND "acceptedByName" IS NOT NULL)
);
