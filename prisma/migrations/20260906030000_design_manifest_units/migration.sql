-- v0.3 stores an immutable action/name/kind snapshot for each unit change.
ALTER TABLE "Change" ADD COLUMN "action" "ChangeType";
ALTER TABLE "Change" ADD COLUMN "newName" TEXT;
ALTER TABLE "Change" ADD COLUMN "kind" TEXT;

ALTER TABLE "Proposal" ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "Proposal_projectId_authorId_requestId_key"
  ON "Proposal"("projectId", "authorId", "requestId");

-- All v0.3 changes reserve a targetFileId, including ADD_UNIT. PostgreSQL permits
-- legacy NULL rows, while preventing a proposal from changing one unit twice.
CREATE UNIQUE INDEX "Change_changeSetId_targetFileId_key"
  ON "Change"("changeSetId", "targetFileId");
