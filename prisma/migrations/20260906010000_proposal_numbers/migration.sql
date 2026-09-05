ALTER TABLE "Proposal" ADD COLUMN "proposalNumber" INTEGER;

WITH numbered AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", id))::INTEGER AS "proposalNumber"
  FROM "Proposal"
)
UPDATE "Proposal" AS proposal
SET "proposalNumber" = numbered."proposalNumber"
FROM numbered
WHERE proposal.id = numbered.id;

ALTER TABLE "Proposal" ALTER COLUMN "proposalNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Proposal_projectId_proposalNumber_key" ON "Proposal"("projectId", "proposalNumber");
