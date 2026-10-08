import { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";

const documentKey = /^project-documents\/([a-zA-Z0-9_-]+)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(?:png|jpg)$/;
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

function legacyUrl(key, bucket, endpoint, region) {
  return endpoint ? `${endpoint.replace(/\/$/, "")}/${bucket}/${key}` : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// Conservative: even a reference in code, an unrelated document or a private
// project retains the object. Reading protection is not a deletion criterion.
export async function hasReference(tx, key, { bucket, endpoint, region }) {
  const values = [key, `/api/assets?key=${encodeURIComponent(key)}`, legacyUrl(key, bucket, endpoint, region)];
  const [project, documents, preview, revision, change, rights] = await Promise.all([
    tx.project.findFirst({ where: { OR: [
      { coverUrl: { in: values } },
      ...[key, encodeURIComponent(key)].map((value) => ({ document: { contains: value } })),
    ] }, select: { id: true } }),
    tx.project.findMany({ where: { document: { not: "" } }, select: { document: true } }),
    tx.preview.findFirst({ where: { OR: [{ key }, { url: { in: values } }] }, select: { id: true } }),
    tx.revision.findFirst({ where: { OR: [{ sourceKey: key }, { sourceUrl: { in: values } }] }, select: { id: true } }),
    tx.change.findFirst({ where: { assetKey: key }, select: { id: true } }),
    tx.revisionRightsItem.findFirst({ where: { sourceUrl: { in: values } }, select: { id: true } }),
  ]);
  const documentReference = documents.some(({ document }) => {
    // Accept equivalent percent encodings too, including lowercase escapes.
    const decoded = document.replace(/(?:%[0-9a-f]{2})+/gi, (value) => {
      try { return decodeURIComponent(value); } catch { return value; }
    });
    return decoded.includes(key);
  });
  return Boolean(project || documentReference || preview || revision || change || rights);
}

export async function cleanupDocumentImages({ prisma, client, bucket, endpoint, region = "us-east-1", apply = false, graceHours = defaultGraceHours, now = new Date(), log = console.log }) {
  if (!Number.isFinite(graceHours) || graceHours < 24) throw new Error("Grace period must be at least 24 hours.");
  const cutoff = now.getTime() - graceHours * 3600000;
  const summary = { scanned: 0, retained: 0, candidates: 0, deleted: 0, errors: 0 };
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "project-documents/", ContinuationToken: token }));
    for (const object of page.Contents ?? []) {
      summary.scanned++;
      const key = object.Key;
      if (!key || !documentKey.test(key) || !object.LastModified || object.LastModified.getTime() >= cutoff) { summary.retained++; continue; }
      try {
        const result = await prisma.$transaction(async (tx) => {
          // Serializes cleanup with document saves. The table locks also stop
          // other asset-reference writers until recheck and S3 deletion finish.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(135, 1)::text`;
          await tx.$executeRawUnsafe('LOCK TABLE "Project", "Preview", "Revision", "Change", "RevisionRightsItem" IN SHARE ROW EXCLUSIVE MODE');
          if (await hasReference(tx, key, { bucket, endpoint, region })) return "retained";
          const current = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          if (!current.LastModified || current.LastModified.getTime() >= cutoff) return "retained";
          if (!apply) return "candidate";
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          return "deleted";
        }, { maxWait: 10000, timeout: 20000 });
        if (result === "retained") summary.retained++;
        else { summary.candidates++; if (result === "deleted") summary.deleted++; log(JSON.stringify({ action: result, key })); }
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404) { summary.retained++; continue; }
        summary.errors++;
        log(JSON.stringify({ action: "error", key, message: error instanceof Error ? error.message : "Cleanup failed" }));
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !token) throw new Error("Storage returned a truncated page without a continuation token.");
  } while (token);
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
