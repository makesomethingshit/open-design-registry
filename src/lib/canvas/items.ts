import { canvasItemImageMetadata, canvasItemTextInput, canvasImageMimeTypes, maxCanvasImageBytes } from "./item-input";
import { canvasFacts, CanvasError, lockCanvas } from "./service";
import { mayEditCanvas, mayReadCanvas } from "./access";
import { prisma } from "../prisma";
import { deleteObject, putObject } from "../storage";

export async function createCanvasItem(slug: string, canvasId: string, actorId: string, input: unknown, file?: File) {
  const parsed = (file ? canvasItemImageMetadata : canvasItemTextInput).safeParse(input);
  if (!parsed.success) throw new CanvasError(400, "Invalid Canvas item");
  if (file) {
    if (!canvasImageMimeTypes.has(file.type) || !file.size || file.size > maxCanvasImageBytes) throw new CanvasError(400, "PNG/JPEG image up to 10 MB required");
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const valid = file.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte) : header[0] === 255 && header[1] === 216 && header[2] === 255;
    if (!valid) throw new CanvasError(400, "Invalid image signature");
  }
  // Upload outside the lock, then recheck fresh ACL before attaching the object.
  await prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (!mayEditCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(403, "Only an approved Canvas owner can write");
  });
  const key = file ? `canvas-items/${canvasId}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}` : null;
  try {
    if (file && key) await putObject(file, key);
    return await prisma.$transaction(async (tx) => {
      if (key) await tx.$queryRaw`SELECT pg_advisory_xact_lock(135, 1)::text`;
      const { project, canvas } = await lockCanvas(tx, slug, canvasId);
      if (!mayEditCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(403, "Canvas is no longer writable");
      if (key && await tx.documentImageDeletion.findUnique({ where: { key } })) throw new CanvasError(409, "Upload expired; upload the image again");
      return tx.canvasItem.create({ data: { ...parsed.data, canvasId, authorId: actorId, assetKey: key } });
    });
  } catch (error) {
    if (key) {
      // A rejected PUT may still have committed remotely; always attempt removal.
      try { await deleteObject(key); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Canvas upload cleanup failed for ${key}`);
      }
    }
    throw error;
  }
}

export async function archiveCanvasItem(slug: string, canvasId: string, itemId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (!mayEditCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(403, "Canvas is not writable");
    const item = await tx.canvasItem.findFirst({ where: { id: itemId, canvasId } });
    if (!item) throw new CanvasError(404, "Item not found");
    return item.archivedAt ? item : tx.canvasItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } });
  });
}

export async function readCanvasItems(slug: string, canvasId: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (!mayReadCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(404, "Canvas not found");
    return tx.canvasItem.findMany({ where: { canvasId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { author: { select: { name: true } } } });
  });
}

export async function mayReadCanvasAsset(key: string, actorId: string | null) {
  const references = await prisma.canvasItem.findMany({ where: { assetKey: key }, include: { canvas: { include: { project: { select: { isPublic: true, ownerId: true } } } } } });
  return references.some(({ canvas }) => mayReadCanvas(actorId, canvasFacts(canvas.project, canvas)));
}
