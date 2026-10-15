import type { PrismaClient } from "@prisma/client";
import type { S3Client } from "@aws-sdk/client-s3";

export function cleanupDocumentImages(options: {
  prisma: PrismaClient;
  client: S3Client;
  bucket: string;
  endpoint?: string;
  region?: string;
  apply?: boolean;
  graceHours?: number;
  now?: Date;
  log?: (value: string) => void;
}): Promise<{ scanned: number; retained: number; candidates: number; deleted: number; errors: number }>;
