import { canvasItemImageMetadata, canvasItemTextInput, canvasImageMimeTypes, maxCanvasImageBytes } from "./item-input";
import { canvasFacts, CanvasError, lockCanvas } from "./service";
import { mayEditCanvas, mayReadCanvas } from "./access";
import { prisma } from "../prisma";
import { assetKeyFromStoredUrl, deleteObject, documentImageExists, getObject, putObject } from "../storage";
import { documentImageKeyFromUrl } from "../document-image-urls.mjs";
import { imageReferenceTransactionOptions } from "../project-document-save";

export async function createCanvasItem(slug: string, canvasId: string, actorId: string, input: unknown, file?: File) {
  const parsed = (file ? canvasItemImageMetadata : canvasItemTextInput).safeParse(input);
  if (!parsed.success) throw new CanvasError(400, "Invalid Canvas item");
  let sourceUrl = parsed.data.sourceUrl;
  if (sourceUrl && process.env.BETTER_AUTH_URL) {
    const source = new URL(sourceUrl);
    if (source.origin === new URL(process.env.BETTER_AUTH_URL).origin) sourceUrl = source.pathname + source.search;
  }
  const sourceKey = documentImageKeyFromUrl(parsed.data.sourceUrl) ?? assetKeyFromStoredUrl(sourceUrl);
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
      if (key || parsed.data.sourceUrl) await tx.$queryRaw`SELECT pg_advisory_xact_lock(135, 1)::text`;
      const { project, canvas } = await lockCanvas(tx, slug, canvasId);
      if (!mayEditCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(403, "Canvas is no longer writable");
      if (key && await tx.documentImageDeletion.findUnique({ where: { key } })) throw new CanvasError(409, "Upload expired; upload the image again");
      if (sourceKey && (await tx.documentImageDeletion.findUnique({ where: { key: sourceKey } }) || !await documentImageExists(sourceKey))) throw new CanvasError(409, "Source image expired; upload it again");
      return tx.canvasItem.create({ data: { ...parsed.data, canvasId, authorId: actorId, assetKey: key }, include: { author: { select: { name: true } } } });
    }, imageReferenceTransactionOptions);
  } catch (error) {
    if (key) {
      try {
        // Wait out an ambiguous commit before deciding whether these bytes are orphaned.
        const unreferenced = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(135, 1)::text`;
          if (await tx.canvasItem.findFirst({ where: { assetKey: key }, select: { id: true } })) return false;
          await tx.documentImageDeletion.upsert({ where: { key }, create: { key }, update: {} });
          return true;
        }, imageReferenceTransactionOptions);
        if (unreferenced) await deleteObject(key);
      } catch (cleanupError) {
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

export async function readCanvasAsset(key: string, actorId: string | null) {
  const reference = await prisma.canvasItem.findFirst({ where: { assetKey: key }, select: { canvasId: true, canvas: { select: { project: { select: { slug: true } } } } } });
  if (!reference) return null;
  const authorized = () => prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, reference.canvas.project.slug, reference.canvasId);
    return mayReadCanvas(actorId, canvasFacts(project, canvas))
      && Boolean(await tx.canvasItem.findFirst({ where: { canvasId: canvas.id, assetKey: key }, select: { id: true } }))
      && !await tx.moderationAssetBlock.findFirst({ where: { key, blocked: true }, select: { key: true } });
  }, imageReferenceTransactionOptions);
  if (!await authorized()) return null;

  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timedOut = false, oversized = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelBody = (reason: unknown) => {
    controller.abort(reason);
    if (reader) void reader.cancel(reason).catch(() => {}).finally(() => {
      try { reader?.releaseLock(); } catch { /* A read may still be settling. */ }
    });
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      const error = new Error("Canvas asset read timed out");
      cancelBody(error);
      reject(error);
    }, 10_000);
  });
  try {
    const read = (async () => {
      const object = await getObject(key, controller.signal);
      if (!object.Body) return null;
      const stream = object.Body.transformToWebStream();
      if (controller.signal.aborted) {
        void stream.cancel(controller.signal.reason).catch(() => {});
        return null;
      }
      reader = stream.getReader();
      if (!canvasImageMimeTypes.has(object.ContentType ?? "") || (object.ContentLength ?? 0) > maxCanvasImageBytes) {
        cancelBody(new Error("Canvas asset has an invalid type or size"));
        return null;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), timeout]);
        if (done) break;
        size += value.byteLength;
        if (size > maxCanvasImageBytes) {
          oversized = true;
          cancelBody(new Error("Canvas asset exceeds the size limit"));
          return null;
        }
        chunks.push(value);
      }
      return { bytes: Buffer.concat(chunks, size), contentType: object.ContentType! };
    })();
    const object = await Promise.race([read, timeout]);
    if (!object || !await authorized()) return null;
    return object;
  } catch (error) {
    if (!timedOut && !oversized) throw error;
    return null;
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) reader?.releaseLock();
  }
}
