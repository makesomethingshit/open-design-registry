-- v0.4 persists only a finalized revision capability and adapter provenance.
CREATE TYPE "RevisionCapabilityMode" AS ENUM ('STRUCTURED', 'WHOLE_DOCUMENT');
CREATE TYPE "AdapterConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NOT_ASSESSED');

ALTER TABLE "Revision"
  ADD COLUMN "capabilityMode" "RevisionCapabilityMode",
  ADD COLUMN "capabilityUnitCount" INTEGER,
  ADD COLUMN "adapterId" TEXT,
  ADD COLUMN "adapterVersion" TEXT,
  ADD COLUMN "adapterConfidence" "AdapterConfidence",
  ADD COLUMN "adapterMaturity" TEXT;
