import { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import { documentImageKeyFromUrl, encodedKeyPattern } from "../src/lib/document-image-urls.mjs";

const documentKey = /^project-documents\/([a-zA-Z0-9_-]+)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg)$/;
const canvasKey = /^canvas-items\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}\.(?:png|jpg)$/;
export const defaultGraceHours = 168;

export function cleanupOptions(args) {
  let apply = false;
  let graceHours = defaultGraceHours;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") apply = true;
    else if (args[i] === "--grace-hours") graceHours = Number(args[++i]);
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  if (!Number.isFinite(graceHours) || graceHours < 24) throw new Error("Grace period must be at least 24 hours.");
  return { apply, graceHours };
}

// Conservative: even a reference in code, an unrelated document or a private
// project retains the object. Reading protection is not a deletion criterion.
export async function hasReference(tx, key, { bucket, endpoint, region }) {
  // shortcut: provenance URL lookalikes retain bytes; normalize more URL forms if retention becomes costly.
  const references = await tx.$queryRawUnsafe(`
    SELECT 'document' AS kind, '' AS value WHERE EXISTS (SELECT 1 FROM "Project" WHERE document ~* $1)
    UNION ALL SELECT 'key', "sourceKey" FROM "Revision" WHERE "sourceKey" = $2
    UNION ALL SELECT 'key', key FROM "Preview" WHERE key = $2
    UNION ALL SELECT 'key', "assetKey" FROM "Change" WHERE "assetKey" = $2
    UNION ALL SELECT 'key', "assetKey" FROM "CanvasItem" WHERE "assetKey" = $2
    UNION ALL SELECT 'canvas-source', "sourceUrl" FROM "CanvasItem" WHERE "sourceUrl" ~* $1
    UNION ALL SELECT 'url', "coverUrl" FROM "Project" WHERE "coverUrl" ~* $1
    UNION ALL SELECT 'url', url FROM "Preview" WHERE url ~* $1
    UNION ALL SELECT 'url', "sourceUrl" FROM "Revision" WHERE "sourceUrl" ~* $1
    UNION ALL SELECT 'url', "sourceLicenseUrl" FROM "RevisionRightsDeclaration" WHERE "sourceLicenseUrl" ~* $1
    UNION ALL SELECT 'url', "sourceUrl" FROM "RevisionRightsItem" WHERE "sourceUrl" ~* $1
    UNION ALL SELECT 'url', "licenseUrl" FROM "RevisionRightsItem" WHERE "licenseUrl" ~* $1
  `, encodedKeyPattern(key), key);
  return references.some(({ kind, value }) => kind !== "url" || documentImageKeyFromUrl(value, { bucket, endpoint, region }) === key);
}

export async function cleanupDocumentImages({ prisma, client, bucket, endpoint, region = "us-east-1", apply = false, graceHours = defaultGraceHours, now = new Date(), log = console.log }) {
  if (!Number.isFinite(graceHours) || graceHours < 24) throw new Error("Grace period must be at least 24 hours.");
  const cutoff = now.getTime() - graceHours * 3600000;
  const summary = { scanned: 0, retained: 0, candidates: 0, deleted: 0, errors: 0 };
  for (const prefix of ["project-documents/", "canvas-items/"]) {
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const object of page.Contents ?? []) {
      summary.scanned++;
      const key = object.Key;
      if (!key || (!documentKey.test(key) && !canvasKey.test(key)) || !object.LastModified || object.LastModified.getTime() >= cutoff) { summary.retained++; continue; }
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Serializes cleanup with document saves. The table locks also stop
          // other asset-reference writers until recheck and deletion intent commit.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(135, 1)::text`;
          await tx.$executeRawUnsafe('LOCK TABLE "Project", "Preview", "Revision", "Change", "RevisionRightsDeclaration", "RevisionRightsItem", "CanvasItem" IN SHARE ROW EXCLUSIVE MODE');
          if (await hasReference(tx, key, { bucket, endpoint, region })) return "retained";
          const current = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          if (!current.LastModified || current.LastModified.getTime() >= cutoff) return "retained";
          if (!apply) return "candidate";
          await tx.documentImageDeletion.upsert({ where: { key }, create: { key }, update: {} });
          return "marked";
        }, { maxWait: 10000, timeout: 20000 });
        if (result === "retained") summary.retained++;
        else {
          summary.candidates++;
          if (result === "marked") {
            // A timeout or lost response cannot make the key usable again:
            // the committed marker rejects future document saves before HEAD.
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
            summary.deleted++;
          }
          log(JSON.stringify({ action: result === "marked" ? "deleted" : result, key }));
        }
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404) { summary.retained++; continue; }
        summary.errors++;
        log(JSON.stringify({ action: "error", key, message: error instanceof Error ? error.message : "Cleanup failed" }));
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !token) throw new Error("Storage returned a truncated page without a continuation token.");
  } while (token);
  }
  log(JSON.stringify({ mode: apply ? "apply" : "dry-run", graceHours, ...summary }));
  return summary;
}

async function main() {
  const options = cleanupOptions(process.argv.slice(2));
  const bucket = process.env.S3_BUCKET ?? "open-design-registry";
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const region = process.env.S3_REGION ?? "us-east-1";
  const prisma = new PrismaClient();
  const client = new S3Client({ region, endpoint, forcePathStyle: Boolean(endpoint), credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } : undefined });
  try {
    const result = await cleanupDocumentImages({ prisma, client, bucket, endpoint, region, ...options });
    if (result.errors) process.exitCode = 1;
  } finally { client.destroy(); await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Cleanup failed"); process.exitCode = 1; });
}
