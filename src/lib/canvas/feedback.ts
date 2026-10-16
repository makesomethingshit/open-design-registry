import { prisma } from "../prisma";
import { canvasFacts, CanvasError, lockCanvas, lockCanvasForRead } from "./service";
import { mayCommentOnCanvas, mayEditCanvas, mayReadCanvas } from "./access";
import { canvasCommentInputSchema, canvasLayoutOperationSchema } from "./spatial";

export async function editCanvasLayout(slug: string, canvasId: string, actorId: string, input: unknown) {
  const parsed = canvasLayoutOperationSchema.safeParse(input);
  if (!parsed.success) throw new CanvasError(400, "Invalid layout edit");
  const { itemId, expectedCanvasVersion } = parsed.data;
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (!mayEditCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(403, "Canvas is not writable");
    const item = await tx.canvasItem.findFirst({ where: { id: itemId, canvasId, archivedAt: null } });
    if (!item) throw new CanvasError(404, "Active item not found");
    if (canvas.layoutVersion !== expectedCanvasVersion) throw new CanvasError(409, "Canvas changed; reload before editing");
    const incrementVersion = async () => {
      const updated = await tx.projectCanvas.updateMany({ where: { id: canvasId, layoutVersion: expectedCanvasVersion }, data: { layoutVersion: { increment: 1 } } });
      if (updated.count !== 1) throw new CanvasError(409, "Canvas changed; reload before editing");
    };
    if ("rect" in parsed.data) {
      const rect = parsed.data.rect;
      if ((["x", "y", "width", "height", "zIndex"] as const).every((key) => item[key] === rect[key])) return {
        item: await tx.canvasItem.findUniqueOrThrow({ where: { id: item.id }, include: { author: { select: { name: true } } } }),
        layoutVersion: canvas.layoutVersion,
      };
      await incrementVersion();
      return {
        item: await tx.canvasItem.update({ where: { id: item.id }, data: rect, include: { author: { select: { name: true } } } }),
        layoutVersion: expectedCanvasVersion + 1,
      };
    }

    const boardItems = await tx.canvasItem.findMany({ where: { canvasId }, orderBy: [{ zIndex: "asc" }, { id: "asc" }], include: { author: { select: { name: true } } } });
    if ((parsed.data.action === "front" ? boardItems.at(-1) : boardItems[0])?.id === item.id) return { items: boardItems, layoutVersion: canvas.layoutVersion };
    await incrementVersion();
    const rest = boardItems.filter((candidate) => candidate.id !== item.id);
    const ordered = parsed.data.action === "front" ? [...rest, ...boardItems.filter((candidate) => candidate.id === item.id)] : [...boardItems.filter((candidate) => candidate.id === item.id), ...rest];
    const changed = ordered.flatMap((candidate, zIndex) => candidate.zIndex === zIndex ? [] : [{ id: candidate.id, zIndex }]);
    if (changed.length) await tx.$executeRaw`
      UPDATE "CanvasItem" AS item SET "zIndex" = layer."zIndex", "updatedAt" = NOW()
      FROM jsonb_to_recordset(${JSON.stringify(changed)}::jsonb) AS layer(id text, "zIndex" integer)
      WHERE item.id = layer.id AND item."canvasId" = ${canvasId}`;
    const items = await tx.canvasItem.findMany({ where: { canvasId }, orderBy: [{ zIndex: "asc" }, { id: "asc" }], include: { author: { select: { name: true } } } });
    return { items, layoutVersion: expectedCanvasVersion + 1 };
  });
}

export async function createCanvasComment(slug: string, canvasId: string, actorId: string, input: unknown) {
  const parsed = canvasCommentInputSchema.safeParse(input);
  if (!parsed.success) throw new CanvasError(400, "Invalid comment");
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (!mayCommentOnCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(403, "Canvas does not accept comments");
    const item = await tx.canvasItem.findFirst({ where: { id: parsed.data.itemId, canvasId } });
    if (!item) throw new CanvasError(404, "Item not found");
    if (item.archivedAt) throw new CanvasError(409, "Archived items do not accept comments");
    return tx.canvasItemComment.create({ data: { itemId: item.id, authorId: actorId, body: parsed.data.body }, include: { author: { select: { name: true } } } });
  });
}

export async function readCanvasComments(slug: string, canvasId: string, itemId: string, actorId: string | null, cursor?: string | null) {
  let after: { createdAt: Date; id: string } | undefined;
  if (cursor) {
    try {
      const value = JSON.parse(cursor);
      if (typeof value.id !== "string" || !value.id || value.id.length > 200 || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) throw new Error();
      after = { id: value.id, createdAt: new Date(value.createdAt) };
    } catch { throw new CanvasError(400, "Invalid feedback cursor"); }
  }
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvasForRead(tx, slug, canvasId);
    if (!mayReadCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(404, "Canvas not found");
    const item = await tx.canvasItem.findFirst({ where: { id: itemId, canvasId } });
    if (!item) throw new CanvasError(404, "Item not found");
    const rows = await tx.canvasItemComment.findMany({ take: 51, where: { itemId, ...(after ? { OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, itemId: true, body: true, createdAt: true, author: { select: { name: true } } } });
    const comments = rows.slice(0, 50);
    const last = comments.at(-1);
    return { comments, nextCursor: rows.length > 50 && last ? JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id }) : null };
  });
}
