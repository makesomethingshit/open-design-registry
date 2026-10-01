ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_APPLIED';

ALTER TABLE "Notification" ADD COLUMN "proposalId" TEXT;
CREATE INDEX "Notification_proposalId_idx" ON "Notification"("proposalId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
