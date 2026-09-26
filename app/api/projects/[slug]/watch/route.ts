import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, isPublic: true } });
  if (!project?.isPublic) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  await prisma.projectWatch.upsert({
    where: { userId_projectId: { userId: session.user.id, projectId: project.id } },
    create: { userId: session.user.id, projectId: project.id },
    update: {},
  });
  return NextResponse.json({ watched: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, isPublic: true } });
  if (!project?.isPublic) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  await prisma.projectWatch.deleteMany({ where: { userId: session.user.id, projectId: project.id } });
  return NextResponse.json({ watched: false });
}
