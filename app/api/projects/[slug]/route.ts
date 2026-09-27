import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { projectUpdateSchema } from "@/src/lib/project-validation";
import { publicAssetUrl } from "@/src/lib/storage";

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
  const updated = await prisma.project.update({ where: { slug }, data: { ...data, ...(data.isPublic === true && !project.isPublic ? { publicationConfirmedAt: new Date(), publicationConfirmedBy: session.user.id } : {}) } });
  return NextResponse.json({ ...updated, coverUrl: publicAssetUrl(updated.coverUrl) });
}
