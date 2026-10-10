import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const bucket = process.env.S3_BUCKET ?? "open-design-registry";
const client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
    : undefined,
});

export async function putCover(file: File, key: string) {
  return putObject(file, key);
}

export async function putObject(file: File, key: string) {
  const body = Buffer.from(await file.arrayBuffer());
  await putBytes(body, key, file.type);
  return assetUrl(key);
}

export async function putBytes(body: Buffer, key: string, contentType = "application/octet-stream") {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return assetUrl(key);
}

export async function deleteObject(key: string) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObject(key: string) {
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function documentImageExists(key: string, abortSignal = AbortSignal.timeout(5000)) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal });
    return true;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

export function assetUrl(key: string) {
  return `/api/assets?key=${encodeURIComponent(key)}`;
}

export function publicAssetUrl(value: string) {
  if (value.startsWith("/api/assets?")) return value;
  return /^https?:\/\//i.test(value)
    ? `/api/assets?url=${encodeURIComponent(value)}`
    : assetUrl(value);
}

export function legacyObjectUrl(key: string) {
  const endpoint = process.env.S3_ENDPOINT;
  return endpoint ? `${endpoint.replace(/\/$/, "")}/${bucket}/${key}` : `https://${bucket}.s3.${process.env.S3_REGION ?? "us-east-1"}.amazonaws.com/${key}`;
}

export const objectUrl = legacyObjectUrl;

// Resolve the canonical S3 key used by both the moderation route and asset proxy.
// Only our own proxy or configured bucket URLs are accepted; arbitrary URLs are not.
export function assetKeyFromStoredUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/api/assets?")) {
    try {
      const url = new URL(value, "http://localhost");
      const hasKey = url.searchParams.has("key");
      const hasUrl = url.searchParams.has("url");
      if (hasKey === hasUrl) return null;
      const candidate = hasKey ? url.searchParams.get("key") : legacyAssetKey(url.searchParams.get("url"));
      return candidate && validAssetKey(candidate) ? candidate : null;
    } catch {
      return null;
    }
  }
  const candidate = legacyAssetKey(value);
  return candidate && validAssetKey(candidate) ? candidate : null;
}

export function legacyAssetKey(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    const endpoint = process.env.S3_ENDPOINT;
    if (endpoint) {
      const configured = new URL(endpoint);
      if (url.origin !== configured.origin) return null;
      const prefix = [configured.pathname.replace(/^\/+|\/+$/g, ""), bucket].filter(Boolean).join("/");
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      return path.startsWith(prefix + "/") ? path.slice(prefix.length + 1) : null;
    }
    const region = process.env.S3_REGION ?? "us-east-1";
    if (url.hostname.toLowerCase() !== bucket.toLowerCase() + ".s3." + region.toLowerCase() + ".amazonaws.com") return null;
    return decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
}

function validAssetKey(key: string): boolean {
  return key.length > 0 && key.length <= 1024 && !key.startsWith("/") && !key.split("/").includes("..");
}

