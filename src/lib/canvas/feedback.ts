import { prisma } from "../prisma";
import { canvasFacts, CanvasError, lockCanvas } from "./service";
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
    const updated = await tx.projectCanvas.updateMany({ where: { id: canvasId, layoutVersion: expectedCanvasVersion }, data: { layoutVersion: { increment: 1 } } });
    if (updated.count !== 1) throw new CanvasError(409, "Canvas changed; reload before editing");
    if ("rect" in parsed.data) return {
      item: await tx.canvasItem.update({ where: { id: item.id }, data: parsed.data.rect, include: { author: { select: { name: true } } } }),
      layoutVersion: expectedCanvasVersion + 1,
    };

    const active = await tx.canvasItem.findMany({ where: { canvasId, archivedAt: null }, orderBy: [{ zIndex: "asc" }, { id: "asc" }], include: { author: { select: { name: true } } } });
    const rest = active.filter((candidate) => candidate.id !== item.id);
    const ordered = parsed.data.action === "front" ? [...rest, ...active.filter((candidate) => candidate.id === item.id)] : [...active.filter((candidate) => candidate.id === item.id), ...rest];
    const items = [];
    for (const [zIndex, candidate] of ordered.entries()) {
      items.push(candidate.zIndex === zIndex ? candidate : await tx.canvasItem.update({ where: { id: candidate.id }, data: { zIndex }, include: { author: { select: { name: true } } } }));
    }
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

export async function readCanvasComments(slug: string, canvasId: string, itemId: string, actorId: string | null) {
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (!mayReadCanvas(actorId, canvasFacts(project, canvas))) throw new CanvasError(404, "Canvas not found");
    const item = await tx.canvasItem.findFirst({ where: { id: itemId, canvasId } });
    if (!item) throw new CanvasError(404, "Item not found");
    return tx.canvasItemComment.findMany({ where: { itemId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { author: { select: { name: true } } } });
  });
}
