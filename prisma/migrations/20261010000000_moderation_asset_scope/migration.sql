CREATE TABLE "ModerationProjectHold" (
    "projectId" TEXT NOT NULL,
    "wasPublic" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reportId" TEXT NOT NULL,
    "hiddenById" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredById" TEXT,
    "restoredAt" TIMESTAMP(3),
    CONSTRAINT "ModerationProjectHold_pkey" PRIMARY KEY ("projectId")
);

CREATE TABLE "ModerationAssetBlock" (
    "key" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "reportId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "blockedById" TEXT NOT NULL,
    "blockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredById" TEXT,
    "restoredAt" TIMESTAMP(3),
    CONSTRAINT "ModerationAssetBlock_pkey" PRIMARY KEY ("key", "reportId")
);

CREATE INDEX "ModerationAssetBlock_key_blocked_idx" ON "ModerationAssetBlock"("key", "blocked");

CREATE TABLE "ModerationEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "projectId" TEXT,
    "assetKey" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModerationEvent_reportId_createdAt_idx" ON "ModerationEvent"("reportId", "createdAt");
CREATE INDEX "ModerationEvent_projectId_createdAt_idx" ON "ModerationEvent"("projectId", "createdAt");
CREATE INDEX "ModerationEvent_assetKey_createdAt_idx" ON "ModerationEvent"("assetKey", "createdAt");
