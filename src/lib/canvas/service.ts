import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { lockPublicProject, PrivateProjectWrite } from "../project-visibility-lock";

export class CanvasError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const CANVAS_PAGE_SIZE = 20;

export async function lockCanvas(tx: Prisma.TransactionClient, slug: string, canvasId: string) {
  const found = await tx.project.findUnique({ where: { slug }, select: { id: true } });
  if (!found) throw new CanvasError(404, "Canvas not found");
  const project = await lockPublicProject(tx, found.id);
  await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} AND "projectId" = ${project.id} FOR UPDATE`;
  const canvas = await tx.projectCanvas.findFirst({ where: { id: canvasId, projectId: project.id } });
  if (!canvas) throw new CanvasError(404, "Canvas not found");
  return { project, canvas };
}

export async function lockCanvasForRead(tx: Prisma.TransactionClient, slug: string, canvasId: string) {
  const found = await tx.project.findUnique({ where: { slug }, select: { id: true } });
  if (!found) throw new CanvasError(404, "Canvas not found");
  const project = await lockPublicProject(tx, found.id);
  await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} AND "projectId" = ${project.id} FOR SHARE`;
  const canvas = await tx.projectCanvas.findFirst({ where: { id: canvasId, projectId: project.id } });
  if (!canvas) throw new CanvasError(404, "Canvas not found");
  return { project, canvas };
}

export function canvasFacts(project: { isPublic: boolean; ownerId: string }, canvas: { ownerId: string | null; accessStatus: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED"; firstApprovedAt: Date | null }) {
  return { projectPublic: project.isPublic, projectOwnerId: project.ownerId, canvasOwnerId: canvas.ownerId, status: canvas.accessStatus, previouslyApproved: canvas.firstApprovedAt !== null };
}

export async function applyForCanvas(slug: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    // Lock the parent even before a Canvas exists, so concurrent first applications serialize.
    await tx.$queryRaw`SELECT id FROM "Project" WHERE slug = ${slug} FOR UPDATE`;
    const project = await lockPublicProject(tx, (await tx.project.findUnique({ where: { slug }, select: { id: true } }))?.id ?? "");
    const existing = await tx.projectCanvas.findUnique({ where: { projectId_ownerId: { projectId: project.id, ownerId: actorId } } });
    const isProjectOwner = project.ownerId === actorId;
    if (!existing) {
      const now = new Date();
      return tx.projectCanvas.create({ data: {
        projectId: project.id, ownerId: actorId,
        ...(isProjectOwner ? { accessStatus: "APPROVED" as const, approvedById: actorId, approvedAt: now, firstApprovedAt: now } : {}),
      } });
    }
    // The Project owner needs no separate approval for their own Canvas.
    // Retain any original first approval timestamp when reactivating the same row.
    if (isProjectOwner && existing.accessStatus !== "APPROVED") {
      const now = new Date();
      return tx.projectCanvas.update({ where: { id: existing.id }, data: {
        accessStatus: "APPROVED", approvedById: actorId, approvedAt: now, firstApprovedAt: existing.firstApprovedAt ?? now,
      } });
    }
    if (existing.accessStatus === "PENDING" || existing.accessStatus === "APPROVED") return existing;
    return tx.projectCanvas.update({ where: { id: existing.id }, data: { accessStatus: "PENDING", approvedById: null, approvedAt: null } });
  });
}

export async function changeCanvasAccess(slug: string, canvasId: string, actorId: string, action: "approve" | "reject" | "revoke" | "withdraw") {
  return prisma.$transaction(async (tx) => {
    const { project, canvas } = await lockCanvas(tx, slug, canvasId);
    if (actorId !== (action === "withdraw" ? canvas.ownerId : project.ownerId)) throw new CanvasError(403, "Canvas permission required");
    const next = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "REVOKED";
    if (canvas.accessStatus === next) return canvas;
    if (action === "approve" && canvas.ownerId === null) throw new CanvasError(409, "Canvas application has no owner");
    if ((action === "approve" || action === "reject") && canvas.accessStatus !== "PENDING") throw new CanvasError(409, "Application is no longer pending");
    if (action === "revoke" && canvas.accessStatus !== "APPROVED") throw new CanvasError(409, "Canvas is not approved");
    if (action === "withdraw" && canvas.accessStatus === "REJECTED") throw new CanvasError(409, "Rejected applications cannot be withdrawn");
    const now = new Date();
    return tx.projectCanvas.update({ where: { id: canvas.id }, data: {
      accessStatus: next,
      ...(action === "approve" ? { approvedById: actorId, approvedAt: now, firstApprovedAt: canvas.firstApprovedAt ?? now } : { approvedById: null, approvedAt: null }),
    } });
  });
}

function visibleCanvasesWhere(project: { id: string; ownerId: string }, actorId: string | null): Prisma.ProjectCanvasWhereInput {
  return {
    projectId: project.id,
    ...(actorId === project.ownerId ? {} : {
      OR: [
        { accessStatus: "APPROVED" },
        { firstApprovedAt: { not: null } },
        ...(actorId ? [{ ownerId: actorId }] : []),
      ],
    }),
  };
}

export async function readCanvasPage(slug: string, actorId: string | null, cursor?: string | null) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.project.findUnique({ where: { slug }, select: { id: true } });
    if (!found) throw new CanvasError(404, "Project not found");
    const project = await lockPublicProject(tx, found.id);
    const visibleWhere = visibleCanvasesWhere(project, actorId);
    const ownCanvas = actorId
      ? await tx.projectCanvas.findUnique({ where: { projectId_ownerId: { projectId: project.id, ownerId: actorId } }, include: { owner: { select: { name: true } } } })
      : null;
    const where: Prisma.ProjectCanvasWhereInput = {
      ...visibleWhere,
      ...(ownCanvas ? { id: { not: ownCanvas.id } } : {}),
    };
    const validCursor = cursor
      ? await tx.projectCanvas.findFirst({ where: { ...where, id: cursor }, select: { id: true } })
      : null;
    const rows = await tx.projectCanvas.findMany({
      where,
      ...(validCursor ? { cursor: { id: validCursor.id }, skip: 1 } : {}),
      include: { owner: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: CANVAS_PAGE_SIZE + 1,
    });
    const hasNextPage = rows.length > CANVAS_PAGE_SIZE;
    const items = rows.slice(0, CANVAS_PAGE_SIZE);
    if (!validCursor && ownCanvas) items.unshift(ownCanvas);
    return {
      items: items.map((canvas) => ({ ...canvas, projectOwnerId: project.ownerId })),
      nextCursor: hasNextPage ? rows[CANVAS_PAGE_SIZE - 1]?.id ?? null : null,
    };
  });
}

export async function readCanvases(slug: string, actorId: string | null, canvasId?: string) {
  if (!canvasId) return (await readCanvasPage(slug, actorId)).items;
  return prisma.$transaction(async (tx) => {
    const found = await tx.project.findUnique({ where: { slug }, select: { id: true } });
    if (!found) throw new CanvasError(404, "Project not found");
    const project = await lockPublicProject(tx, found.id);
    const rows = await tx.projectCanvas.findMany({
      where: { ...visibleCanvasesWhere(project, actorId), id: canvasId },
      include: { owner: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 1,
    });
    if (!rows.length) throw new CanvasError(404, "Canvas not found");
    return rows.map((canvas) => ({ ...canvas, projectOwnerId: project.ownerId }));
  });
}

export function canvasView(canvas: Awaited<ReturnType<typeof readCanvases>>[number], viewerId: string | null) {
  const isProjectOwner = viewerId === canvas.projectOwnerId;
  const isOwnCanvas = viewerId !== null && viewerId === canvas.ownerId;
  const privateStatus = isProjectOwner || isOwnCanvas;
  return {
    id: canvas.id,
    ownerName: canvas.owner?.name ?? "Former contributor",
    accessStatus: privateStatus ? canvas.accessStatus : canvas.accessStatus === "APPROVED" ? "APPROVED" : "REVOKED",
    firstApprovedAt: canvas.firstApprovedAt?.toISOString() ?? null,
    ...("layoutVersion" in canvas && typeof canvas.layoutVersion === "number" ? { layoutVersion: canvas.layoutVersion } : {}),
    isOwnCanvas,
    canEdit: isOwnCanvas && canvas.accessStatus === "APPROVED",
    canComment: viewerId !== null && canvas.accessStatus === "APPROVED",
    canManage: isProjectOwner && !isOwnCanvas,
    canWithdraw: isOwnCanvas && (canvas.accessStatus === "PENDING" || canvas.accessStatus === "APPROVED"),
    canReapply: isOwnCanvas && (canvas.accessStatus === "REJECTED" || canvas.accessStatus === "REVOKED"),
  };
}

export function canvasFailure(error: unknown): Response | null {
  if (error instanceof PrivateProjectWrite) return Response.json({ error: "Canvas not found" }, { status: 404 });
  if (error instanceof CanvasError) return Response.json({ error: error.message }, { status: error.status });
  return null;
}
