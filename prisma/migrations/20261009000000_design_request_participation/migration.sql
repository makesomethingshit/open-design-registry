CREATE TABLE "DesignRequestParticipation" (
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignRequestParticipation_pkey" PRIMARY KEY ("issueId", "userId")
);

CREATE INDEX "DesignRequestParticipation_issueId_createdAt_userId_idx" ON "DesignRequestParticipation"("issueId", "createdAt", "userId");
CREATE INDEX "DesignRequestParticipation_userId_createdAt_idx" ON "DesignRequestParticipation"("userId", "createdAt");

ALTER TABLE "DesignRequestParticipation" ADD CONSTRAINT "DesignRequestParticipation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignRequestParticipation" ADD CONSTRAINT "DesignRequestParticipation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
