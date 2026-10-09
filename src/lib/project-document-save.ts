import type { Prisma } from "@prisma/client";
import { renderProjectDocument } from "./project-document";
import { documentImageKeyFromUrl } from "./document-image-urls.mjs";
import { documentImageExists } from "./storage";

export const imageReferenceTransactionOptions = { maxWait: 10000, timeout: 60000 };
export class ExpiredDocumentImageError extends Error {
  constructor() { super("An image has expired. Upload it again before saving."); }
}

export async function validateDocumentImageReferences(tx: Prisma.TransactionClient, values: Array<string | null | undefined>, exists?: typeof documentImageExists) {
  const keys = [...new Set(values.map((value) => documentImageKeyFromUrl(value)).filter((key): key is string => Boolean(key)))];
  if (!keys.length) return true;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(135, 1)::text`;
  if (await tx.documentImageDeletion.findFirst({ where: { key: { in: keys } }, select: { key: true } })) return false;
  const abortSignal = AbortSignal.timeout(25000);
  // Bound concurrency instead of issuing one sequential network round trip per image.
  for (let start = 0; start < keys.length; start += 8) {
    if (!(await Promise.all(keys.slice(start, start + 8).map((key) => (exists ?? documentImageExists)(key, abortSignal)))).every(Boolean)) return false;
  }
  return true;
}

export async function validateDocumentImages(tx: Prisma.TransactionClient, document: string, exists = documentImageExists) {
  const urls: string[] = [];
  for (const match of renderProjectDocument(document).matchAll(/<img src="([^"]+)"/g)) {
    urls.push(match[1].replace(/&amp;/g, "&"));
  }
  return validateDocumentImageReferences(tx, urls, exists);
}
