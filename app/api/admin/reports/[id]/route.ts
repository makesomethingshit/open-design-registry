import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";
import { assetKeyFromStoredUrl } from "@/src/lib/storage";

type Action = "NONE" | "HIDE_PROJECT" | "BLOCK_COVER" | "RESTORE_PROJECT" | "UNBLOCK_COVER";
const actions = new Set<Action>(["NONE", "HIDE_PROJECT", "BLOCK_COVER", "RESTORE_PROJECT", "UNBLOCK_COVER"]);

class ModerationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    status?: unknown;
    resolutionNote?: unknown;
    hide?: unknown;
    action?: unknown;
  } | null;
  if (!body || (body.action !== undefined && (typeof body.action !== "string" || !actions.has(body.action as Action)))) {
    return NextResponse.json({ error: "Invalid moderation action" }, { status: 400 });
  }
  // Keep older callers compatible, but no longer hide projects sharing a cover.
  const action: Action = (body.action as Action | undefined) ?? (body.hide === true ? "HIDE_PROJECT" : "NONE");
  const restoring = action === "RESTORE_PROJECT" || action === "UNBLOCK_COVER";
  const status = String(body.status ?? "");
  if (!restoring && !["RESOLVED", "DISMISSED"].includes(status)) {
    return NextResponse.json({ error: "Status must be RESOLVED or DISMISSED" }, { status: 400 });
  }
  if (!restoring && status !== "RESOLVED" && action !== "NONE") {
    return NextResponse.json({ error: "A moderation action requires a resolved report" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const report = await tx.report.findUnique({
        where: { id },
        select: { id: true, projectId: true, revisionId: true },
      });
      if (!report) throw new ModerationError("Report not found", 404);
      const projectId = report.projectId ?? (report.revisionId
        ? (await tx.revision.findUnique({ where: { id: report.revisionId }, select: { projectId: true } }))?.projectId
        : null);
      if (action !== "NONE" && !projectId) throw new ModerationError("Project not found", 404);

      if (action !== "NONE" && projectId) {
        // The fork creation route uses FOR SHARE; serialize scope changes on the same Project row.
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
        const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, isPublic: true, coverUrl: true } });
        if (!project) throw new ModerationError("Project not found", 404);

        if (action === "HIDE_PROJECT") {
          const hold = await tx.moderationProjectHold.findUnique({ where: { projectId } });
          if (!hold?.active) {
            await tx.moderationProjectHold.upsert({
              where: { projectId },
              create: { projectId, reportId: id, wasPublic: project.isPublic, hiddenById: session.user.id },
              update: {
                active: true, wasPublic: project.isPublic, reportId: id,
                hiddenById: session.user.id, hiddenAt: new Date(), restoredById: null, restoredAt: null,
              },
            });
            await tx.project.update({ where: { id: projectId }, data: { isPublic: false } });
            await tx.moderationEvent.create({ data: { action, reportId: id, projectId, actorId: session.user.id } });
          }
        } else if (action === "RESTORE_PROJECT") {
          const hold = await tx.moderationProjectHold.findUnique({ where: { projectId } });
          if (!hold?.active || hold.reportId !== id) throw new ModerationError("No project hide associated with this report", 409);
          // Never expose an owner-private project merely because a report is restored.
          if (hold.wasPublic) await tx.project.update({ where: { id: projectId }, data: { isPublic: true } });
          await tx.moderationProjectHold.update({ where: { projectId }, data: { active: false, restoredAt: new Date(), restoredById: session.user.id } });
          await tx.moderationEvent.create({ data: { action, reportId: id, projectId, actorId: session.user.id } });
        } else {
          const key = assetKeyFromStoredUrl(project.coverUrl);
          if (!key) throw new ModerationError("Only managed cover assets can be blocked", 422);
          const existing = await tx.moderationAssetBlock.findUnique({ where: { key } });
          if (action === "BLOCK_COVER" && !existing?.blocked) {
            await tx.moderationAssetBlock.upsert({
              where: { key },
              create: {
                key, blocked: true, reportId: id, blockedById: session.user.id,
                reason: typeof body.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 2000) : "",
              },
              update: {
                blocked: true, reportId: id, blockedById: session.user.id, blockedAt: new Date(),
                restoredById: null, restoredAt: null,
                reason: typeof body.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 2000) : "",
              },
            });
            await tx.moderationEvent.create({ data: { action, reportId: id, projectId, assetKey: key, actorId: session.user.id } });
          } else if (action === "UNBLOCK_COVER") {
            if (!existing?.blocked || existing.reportId !== id) throw new ModerationError("No asset block associated with this report", 409);
            await tx.moderationAssetBlock.update({ where: { key }, data: { blocked: false, restoredById: session.user.id, restoredAt: new Date() } });
            await tx.moderationEvent.create({ data: { action, reportId: id, projectId, assetKey: key, actorId: session.user.id } });
          }
        }
      }
      if (restoring) return tx.report.findUnique({ where: { id } });
      return tx.report.update({
        where: { id },
        data: {
          status: status as "RESOLVED" | "DISMISSED",
          reviewedBy: session.user.id,
          reviewedAt: new Date(),
          resolutionNote: typeof body.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 2000) : undefined,
        },
      });
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ModerationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Moderation action failed", error);
    return NextResponse.json({ error: "Could not update moderation decision" }, { status: 500 });
  }
}
