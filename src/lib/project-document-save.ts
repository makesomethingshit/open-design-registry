import type { Prisma } from "@prisma/client";
import { renderProjectDocument } from "./project-document";
import { documentImageProjectId } from "./project-document-images";
import { documentImageExists } from "./storage";

// Shared with the manual cleanup command. Held through validation and commit.
export async function validateDocumentImages(tx: Prisma.TransactionClient, document: string, exists = documentImageExists) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(135, 1)::text`;
  const keys = new Set<string>();
  for (const match of renderProjectDocument(document).matchAll(/<img src="([^"]+)"/g)) {
    const value = match[1].replace(/&amp;/g, "&");
    try {
      const url = new URL(value, "http://document.local");
      if (url.pathname !== "/api/assets") continue;
      const key = url.searchParams.get("key");
      if (key && documentImageProjectId(key)) keys.add(key);
    } catch { /* The renderer already rejects invalid image schemes. */ }
  }
  for (const key of keys) {
    if (!await exists(key)) return false;
  }
  return true;
}
