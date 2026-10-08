import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { cleanupDocumentImages } from "./document-image-cleanup.mjs";
import { validateDocumentImages } from "../src/lib/project-document-save";

const enabled = process.env.RUN_DOCUMENT_IMAGE_CLEANUP_TEST === "1";
const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
const bucket = `document-cleanup-${randomUUID()}`;
const endpoint = process.env.S3_ENDPOINT;
const client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin" } });
let project, other, user;
const keys = {};
const image = (key) => `![design](/api/assets?key=${encodeURIComponent(key)})`;
const cleanup = (options = {}) => cleanupDocumentImages({ prisma: db, client, bucket, endpoint, now: new Date(Date.now() + 8 * 86400000), log: () => {}, ...options });
beforeAll(async () => {
  if (!enabled) return;
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  user = await db.user.create({ data: { id: randomUUID(), name: "Cleanup fixture", email: `${randomUUID()}@example.test` } });
  const create = (slug) => db.project.create({ data: { slug, title: "Cleanup fixture", description: "test", license: "MIT", coverUrl: "cover/unused", ownerId: user.id } });
  project = await create(`cleanup-${randomUUID()}`);
  other = await create(`cleanup-other-${randomUUID()}`);
  for (const name of ["abandoned", "removed", "saved", "shared", "race"]) {
    keys[name] = `project-documents/${project.id}/${randomUUID()}.png`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: keys[name], Body: Buffer.from([137,80,78,71,13,10,26,10]), ContentType: "image/png" }));
  }
  await db.project.update({ where: { id: project.id }, data: { document: image(keys.removed) } });
  await db.project.update({ where: { id: project.id }, data: { document: image(keys.saved), isPublic: false } });
  await db.project.update({ where: { id: other.id }, data: { document: image(keys.shared) } });
}, 30000);
afterAll(async () => {
  if (enabled) {
    if (project) await db.documentImageDeletion.deleteMany({ where: { key: { startsWith: `project-documents/${project.id}/` } } });
    if (user) await db.user.delete({ where: { id: user.id } });
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
    for (const object of page.Contents ?? []) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: object.Key }));
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  await db.$disconnect(); client.destroy();
});
it.skipIf(!enabled)("dry-run preserves actual objects; apply removes abandoned/removed images and preserves private/shared references", async () => {
  expect(await cleanup()).toMatchObject({ candidates: 3, deleted: 0, errors: 0 });
  for (const key of Object.values(keys)) expect((await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength).toBe(8);
  expect(await cleanup({ apply: true })).toMatchObject({ deleted: 3, errors: 0 });
  for (const name of ["abandoned", "removed", "race"]) await expect(client.send(new HeadObjectCommand({ Bucket: bucket, Key: keys[name] }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
  for (const name of ["saved", "shared"]) expect((await client.send(new HeadObjectCommand({ Bucket: bucket, Key: keys[name] }))).ContentLength).toBe(8);
  await db.project.update({ where: { id: project.id }, data: { isPublic: true } });
  expect(await cleanup({ apply: true })).toMatchObject({ deleted: 0, errors: 0 });
}, 30000);
it.skipIf(!enabled)("retains deletion intent across an S3 failure so a delayed save cannot adopt the pending object", async () => {
  const key = `project-documents/${project.id}/${randomUUID()}.png`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from([1]) }));
  const failingClient = { send(command) {
    if (command instanceof DeleteObjectCommand && command.input.Key === key) throw new Error("Lost deletion response");
    return client.send(command);
  } };
  expect(await cleanup({ client: failingClient, apply: true })).toMatchObject({ errors: 1 });
  expect(await db.documentImageDeletion.findUnique({ where: { key } })).not.toBeNull();
  expect((await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength).toBe(1);
  let checked = false;
  expect(await db.$transaction((tx) => validateDocumentImages(tx, image(key), async () => { checked = true; return true; }))).toBe(false);
  expect(checked).toBe(false);
  expect(await cleanup({ apply: true })).toMatchObject({ deleted: 1, errors: 0 });
}, 30000);
it.skipIf(!enabled)("a save that commits first is preserved by the cleanup recheck", async () => {
  const key = `project-documents/${project.id}/${randomUUID()}.png`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from([1]) }));
  let release;
  let locked;
  const gate = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { locked = resolve; });
  const save = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(135, 1)::text`;
    await tx.project.update({ where: { id: project.id }, data: { document: `${image(keys.saved)}\n${image(key)}` } });
    locked(); await gate;
  });
  await ready;
  const removal = cleanup({ apply: true });
  release(); await save;
  expect(await removal).toMatchObject({ deleted: 0, errors: 0 });
  expect((await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength).toBe(1);
}, 30000);

it.skipIf(!enabled)("cleanup first makes a delayed draft save reject the missing image", async () => {
  const key = `project-documents/${project.id}/${randomUUID()}.png`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from([1]) }));
  try {
    expect((await cleanup({ apply: true })).errors).toBe(0);
    const valid = await db.$transaction((tx) => validateDocumentImages(tx, image(key), async (key) => {
      try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true; }
      catch (error) { if (error?.$metadata?.httpStatusCode === 404) return false; throw error; }
    }));
    expect(valid).toBe(false);
    expect((await db.project.findUnique({ where: { id: project.id } })).document).not.toContain(encodeURIComponent(key));
  } finally { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
}, 30000);
