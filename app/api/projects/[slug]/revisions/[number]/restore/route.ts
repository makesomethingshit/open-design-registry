import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);

  const { slug, number } = await params;
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return error("Revision not found", 404);

  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true } });
  if (!project) return error("Project not found", 404);
  if (project.ownerId !== session.user.id) return error("Only the project owner can restore revisions", 403);

  try {
    const revision = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
      const source = await tx.revision.findUnique({
        where: { projectId_number: { projectId: project.id, number: revisionNumber } },
        include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } },
      });
      if (!source?.isPublished) throw new RestoreError("Published revision not found", 404);
      const latest = await tx.revision.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" }, select: { id: true, number: true } });
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: project.id,
          number: (latest?.number ?? 0) + 1,
          parentId: latest?.id,
          title: `Restored: ${source.title}`.slice(0, 120),
          changeDescription: `Restored from Revision ${source.number}`,
          sourceKey: source.sourceKey,
          sourceUrl: source.sourceUrl,
          isPublished: false,
          previews: { create: source.previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
        },
      });
      return tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, include: { previews: true } });
    });
    return NextResponse.json(exposeRevision(revision), { status: 201 });
  } catch (cause) {
    if (cause instanceof RestoreError) return error(cause.message, cause.status);
    console.error("revision restore failed", cause);
    return error("Revision could not be restored", 500);
  }
}

class RestoreError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function exposeRevision<T extends { sourceKey?: string | null; sourceUrl?: string | null; isPublished?: boolean; previews?: Array<{ url: string }> }>(revision: T) {
  const { sourceKey, isPublished: _isPublished, previews, ...rest } = revision;
  return {
    ...rest,
    sourceUrl: revision.sourceUrl ?? (sourceKey ? publicAssetUrl(sourceKey) : revision.sourceUrl),
    previews: previews?.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) })),
  };
}
