import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { prisma } from "../prisma";
import * as storage from "../storage";
import { applyForCanvas, changeCanvasAccess } from "./service";
import { archiveCanvasItem, createCanvasItem } from "./items";
import { cleanupDocumentImages } from "../../../scripts/document-image-cleanup.mjs";
import { GET as getAsset } from "../../../app/api/assets/route";
vi.mock("../auth", () => ({ auth: { api: { getSession: async () => null } } }));
const db = process.env.RUN_CANVAS_STORAGE_TEST === "1" && process.env.DATABASE_URL && process.env.S3_ENDPOINT ? describe : describe.skip;
const metadata = { kind: "IMAGE", origin: "ORIGINAL", altText: "One pixel" };
const image = () => new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")], "pixel.png", { type: "image/png" });

db("Canvas PostgreSQL + S3-compatible storage", () => {
  let ownerId: string, authorId: string, projectId: string, slug: string, canvasId: string;
  const keys: string[] = [];
  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    [ownerId, authorId] = ["owner", "author"].map((role) => `canvas-storage-${role}-${suffix}`);
    for (const id of [ownerId, authorId]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    slug = `canvas-storage-${suffix}`;
    projectId = (await prisma.project.create({ data: { slug, ownerId, title: "Canvas", description: "", license: "MIT", coverUrl: "", isPublic: true } })).id;
    canvasId = (await applyForCanvas(slug, authorId)).id;
    await changeCanvasAccess(slug, canvasId, ownerId, "approve");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const key of keys.splice(0)) { await storage.deleteObject(key); await prisma.documentImageDeletion.deleteMany({ where: { key } }); }
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, authorId] } } });
  });

  it("round-trips actual image bytes through the asset GET and private visibility boundary", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image()); keys.push(item.assetKey!);
    const request = () => getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
    const response = await request(); expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(await image().arrayBuffer()));
    await prisma.project.update({ where: { id: projectId }, data: { isPublic: false } });
    expect((await request()).status).toBe(404);
  });

  it("removes real uploaded bytes when revocation commits before attachment", async () => {
    const put = storage.putObject;
    vi.spyOn(storage, "putObject").mockImplementationOnce(async (file, key) => {
      keys.push(key); const result = await put(file, key);
      await changeCanvasAccess(slug, canvasId, ownerId, "revoke"); return result;
    });
    await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toMatchObject({ status: 403 });
    await expect(storage.getObject(keys[0])).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
    expect(await prisma.canvasItem.count({ where: { canvasId } })).toBe(0);
  });

  it("reclaims old orphan objects while retaining referenced archived public history", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image()); keys.push(item.assetKey!);
    await archiveCanvasItem(slug, canvasId, item.id, authorId);
    await changeCanvasAccess(slug, canvasId, ownerId, "revoke");
    const orphan = `canvas-items/${canvasId}/${crypto.randomUUID()}.png`; keys.push(orphan);
    await storage.putObject(image(), orphan);
    const client = new S3Client({ region: process.env.S3_REGION ?? "us-east-1", endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
    try {
      expect(await cleanupDocumentImages({ prisma, client, bucket: process.env.S3_BUCKET!, endpoint: process.env.S3_ENDPOINT, apply: true, now: new Date(Date.now() + 8 * 24 * 3600000), log: () => {} })).toMatchObject({ deleted: 1, retained: 1, errors: 0 });
      expect(await prisma.documentImageDeletion.findUnique({ where: { key: orphan } })).not.toBeNull();
      await expect(storage.getObject(orphan)).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      expect((await storage.getObject(item.assetKey!)).ContentLength).toBe(image().size);
    } finally { client.destroy(); }
  });
  it("retains a document image referenced only by Canvas source provenance", async () => {
    const source = `project-documents/${projectId}/${crypto.randomUUID()}.png`; keys.push(source);
    await storage.putObject(image(), source);
    await createCanvasItem(slug, canvasId, authorId, { kind: "TEXT", origin: "REFERENCE", body: "Reference notes", sourceUrl: storage.legacyObjectUrl(source) });
    const client = new S3Client({ region: process.env.S3_REGION ?? "us-east-1", endpoint: process.env.S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
    try {
      expect(await cleanupDocumentImages({ prisma, client, bucket: process.env.S3_BUCKET!, endpoint: process.env.S3_ENDPOINT, apply: true, now: new Date(Date.now() + 8 * 24 * 3600000), log: () => {} })).toMatchObject({ retained: 1, deleted: 0, errors: 0 });
      expect((await storage.getObject(source)).ContentLength).toBe(image().size);
    } finally { client.destroy(); }
  });
});
