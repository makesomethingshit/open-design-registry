import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { reportSchema } from "@/src/lib/project-validation";
import { maxSmallJsonBytes, readBoundedJson } from "@/src/lib/request-body";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const bodyResult = await readBoundedJson(request, maxSmallJsonBytes);
  if (bodyResult.tooLarge) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  const body = bodyResult.value as { projectSlug?: unknown; revisionId?: unknown; reason?: unknown; details?: unknown } | null;
  const parsed = reportSchema.safeParse({ reason: body?.reason, details: body?.details ?? "" });
  const projectSlug = typeof body?.projectSlug === "string" ? body.projectSlug : undefined;
  const revisionId = typeof body?.revisionId === "string" ? body.revisionId : undefined;
  if (!parsed.success || Boolean(projectSlug) === Boolean(revisionId)) return NextResponse.json({ error: "Choose one public project or revision and provide a reason" }, { status: 400 });
  if (projectSlug) {
    const project = await prisma.project.findUnique({ where: { slug: projectSlug }, select: { id: true, isPublic: true } });
    if (!project?.isPublic) return NextResponse.json({ error: "Public project not found" }, { status: 404 });
    return NextResponse.json(await prisma.report.create({ data: { projectId: project.id, reporterId: session.user.id, ...parsed.data } }), { status: 201 });
  }
  const revision = await prisma.revision.findUnique({ where: { id: revisionId }, select: { id: true, project: { select: { isPublic: true } } } });
  if (!revision?.project.isPublic) return NextResponse.json({ error: "Public revision not found" }, { status: 404 });
  return NextResponse.json(await prisma.report.create({ data: { revisionId: revision.id, reporterId: session.user.id, ...parsed.data } }), { status: 201 });
}
