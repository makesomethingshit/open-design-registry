import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getAdminSession } from "@/src/lib/moderation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await request.json().catch(() => null) as { status?: unknown; resolutionNote?: unknown; hide?: unknown } | null;
  const status = String(body?.status ?? "");
  if (!["RESOLVED", "DISMISSED"].includes(status)) return NextResponse.json({ error: "Status must be RESOLVED or DISMISSED" }, { status: 400 });
  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id }, select: { id: true, projectId: true, revisionId: true } });
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const projectId = report.projectId ?? (report.revisionId ? (await prisma.revision.findUnique({ where: { id: report.revisionId }, select: { projectId: true } }))?.projectId : null);
  if (body?.hide === true && projectId) await prisma.project.update({ where: { id: projectId }, data: { isPublic: false } });
  return NextResponse.json(await prisma.report.update({ where: { id: report.id }, data: { status: status as "RESOLVED" | "DISMISSED", reviewedBy: session.user.id, reviewedAt: new Date(), resolutionNote: typeof body?.resolutionNote === "string" ? body.resolutionNote.trim().slice(0, 2000) : undefined } }));
}
