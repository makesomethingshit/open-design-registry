import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { detectUnitChanges, readRevisionBundleStrict } from "@/src/lib/revision-bundle";

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);

  const { slug } = await params;
  const searchParams = new URL(request.url).searchParams;
  const baseRevisionId = searchParams.get("baseRevisionId")?.trim();
  const sourceRevisionId = searchParams.get("sourceRevisionId")?.trim();
  if (!baseRevisionId || !sourceRevisionId) return error("Base and source revisions are required", 400);

  try {
    const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
    if (!project || (!project.isPublic && project.ownerId !== session.user.id)) return error("Project not found", 404);

    const [baseRevision, sourceRevision] = await Promise.all([
      prisma.revision.findFirst({ where: { id: baseRevisionId, projectId: project.id, isPublished: true }, select: { sourceKey: true } }),
      prisma.revision.findUnique({ where: { id: sourceRevisionId }, select: { isPublished: true, sourceKey: true, project: { select: { ownerId: true } } } }),
    ]);
    if (!baseRevision) return error("Base revision not found", 400);
    if (!sourceRevision?.isPublished || sourceRevision.project.ownerId !== session.user.id) return error("Source revision not found", 400);

    const [baseBundle, sourceBundle] = await Promise.all([readRevisionBundleStrict(baseRevision.sourceKey), readRevisionBundleStrict(sourceRevision.sourceKey)]);
    return NextResponse.json({ changes: detectUnitChanges(baseBundle, sourceBundle), wholeDocument: !baseBundle?.files.length });
  } catch {
    return error("Could not load available changes.", 500);
  }
}
