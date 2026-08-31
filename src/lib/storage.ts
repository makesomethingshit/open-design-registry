import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: file.type }));
  return assetUrl(key);
}

export async function deleteObject(key: string) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getObject(key: string) {
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
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
