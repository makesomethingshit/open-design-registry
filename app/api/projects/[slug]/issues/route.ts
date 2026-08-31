import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { issueSchema } from "@/src/lib/project-validation";

const notFound = () => NextResponse.json({ error: "Project not found" }, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project) return notFound();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!project.isPublic && session?.user.id !== project.ownerId) return notFound();
  const issues = await prisma.issue.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true } }, revision: { select: { number: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } } } });
  return NextResponse.json(issues);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, isPublic: true } });
  if (!project?.isPublic) return notFound();
  const parsed = issueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Title and body are invalid" }, { status: 400 });
  const revisionId = parsed.data.revisionId || undefined;
  if (revisionId) {
    const revision = await prisma.revision.findFirst({ where: { id: revisionId, projectId: project.id }, select: { id: true } });
    if (!revision) return NextResponse.json({ error: "Revision not found" }, { status: 400 });
  }
  const issue = await prisma.issue.create({ data: { projectId: project.id, authorId: session.user.id, title: parsed.data.title, body: parsed.data.body, revisionId }, include: { author: { select: { id: true, name: true } }, revision: { select: { number: true } } } });
  return NextResponse.json(issue, { status: 201 });
}
