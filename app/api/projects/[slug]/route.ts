import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { projectUpdateSchema } from "@/src/lib/project-validation";
import { publicAssetUrl } from "@/src/lib/storage";
import { imageReferenceTransactionOptions, validateDocumentImages } from "@/src/lib/project-document-save";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, include: { owner: { select: { name: true } } } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ ...project, coverUrl: publicAssetUrl(project.coverUrl) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (session.user.id !== project.ownerId) return NextResponse.json({ error: "Project not found." }, { status: project.isPublic ? 403 : 404 });
  const parsed = projectUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data).length) return NextResponse.json({ error: "Check the values you provided." }, { status: 400 });
  const { rightsConfirmed, ...data } = parsed.data;
  if (data.isPublic === true && !project.isPublic && !rightsConfirmed) return NextResponse.json({ error: "Confirm the license and your right to share the source publicly." }, { status: 400 });
  const updateData = { ...data, ...(data.isPublic === true && !project.isPublic ? { publicationConfirmedAt: new Date(), publicationConfirmedBy: session.user.id } : {}) };
  // Ordinary metadata/document saves keep their original low-contention path.
  if (data.isPublic === undefined) {
    const updated = data.document === undefined
      ? await prisma.project.update({ where: { slug }, data: updateData })
      : await prisma.$transaction(async (tx) => {
        if (!await validateDocumentImages(tx, data.document!)) return null;
        return tx.project.update({ where: { slug }, data: updateData });
      }, imageReferenceTransactionOptions);
    if (!updated) return NextResponse.json({ error: "An image has expired. Upload it again before saving." }, { status: 409 });
    return NextResponse.json({ ...updated, coverUrl: publicAssetUrl(updated.coverUrl) });
  }

  const outcome = await prisma.$transaction(async (tx) => {
    // Document cleanup acquires an advisory lock before table locks; do not invert
    // that order by validating a document after locking the Project row.
    if (data.document !== undefined && !await validateDocumentImages(tx, data.document)) return { kind: "expired" as const };
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
    const hold = await tx.moderationProjectHold.findUnique({ where: { projectId: project.id } });
    if (hold?.active && data.isPublic === true) return { kind: "moderated" as const };
    // If the owner explicitly chooses private, later moderation restore must respect it.
    if (hold?.active && data.isPublic === false && hold.wasPublic) {
      await tx.moderationProjectHold.update({ where: { projectId: project.id }, data: { wasPublic: false } });
    }
    return { kind: "updated" as const, project: await tx.project.update({ where: { slug }, data: updateData }) };
  }, imageReferenceTransactionOptions);
  if (outcome.kind === "moderated") return NextResponse.json({ error: "This project was hidden by moderation. Contact an administrator to restore it." }, { status: 409 });
  if (outcome.kind === "expired") return NextResponse.json({ error: "An image has expired. Upload it again before saving." }, { status: 409 });
  return NextResponse.json({ ...outcome.project, coverUrl: publicAssetUrl(outcome.project.coverUrl) });
}
