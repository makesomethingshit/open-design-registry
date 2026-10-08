CREATE TABLE "DocumentImageDeletion" (
    "key" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentImageDeletion_pkey" PRIMARY KEY ("key")
);
