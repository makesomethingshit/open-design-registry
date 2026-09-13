import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { readRevisionBundle, sanitizeUnitName } from "@/src/lib/revision-bundle";
import { getObject } from "@/src/lib/storage";

function notFound() {
  return NextResponse.json({ error: "File not found" }, { status: 404 });
}

function downloadName(name: string) {
  return sanitizeUnitName(name) || "source-file";
}

function encodedDownloadName(name: string) {
  return encodeURIComponent(downloadName(name)).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; number: string; fileId: string }> }) {
  const { slug, number, fileId } = await params;
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return notFound();
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!project || (!project.isPublic && project.ownerId !== session?.user.id)) return notFound();
  const revision = await prisma.revision.findUnique({ where: { projectId_number: { projectId: project.id, number: revisionNumber } }, select: { isPublished: true, sourceKey: true } });
  if (!revision?.isPublished) return notFound();
  const file = (await readRevisionBundle(revision.sourceKey))?.files.find((candidate) => candidate.id === fileId);
  if (!file) return notFound();
  try {
    const object = await getObject(file.assetKey);
    if (!object.Body) return notFound();
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": object.ContentType ?? file.mimeType,
      "Content-Disposition": `attachment; filename="source-file"; filename*=UTF-8''${encodedDownloadName(file.name)}`,
      "X-Content-Type-Options": "nosniff",
    });
    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
    const body = object.Body as typeof object.Body & { transformToWebStream?: () => ReadableStream };
    return new NextResponse(body.transformToWebStream ? body.transformToWebStream() : body as unknown as BodyInit, { headers });
  } catch {
    return notFound();
  }
}
