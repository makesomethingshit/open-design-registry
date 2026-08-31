import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, include: { project: { select: { ownerId: true, isPublic: true, slug: true } }, author: { select: { id: true, name: true } }, revision: { select: { number: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } } } });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!issue.project.isPublic && session?.user.id !== issue.project.ownerId) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  return NextResponse.json(issue);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, select: { project: { select: { ownerId: true, isPublic: true } } } });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (session.user.id !== issue.project.ownerId) return NextResponse.json({ error: "Only the project owner can change issue status" }, { status: issue.project.isPublic ? 403 : 404 });
  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  if (body?.status !== "OPEN" && body?.status !== "CLOSED") return NextResponse.json({ error: "Status must be OPEN or CLOSED" }, { status: 400 });
  const status = body.status;
  const updated = await prisma.issue.update({ where: { id }, data: { status, closedAt: status === "CLOSED" ? new Date() : null, closedBy: status === "CLOSED" ? session.user.id : null }, include: { author: { select: { id: true, name: true } }, revision: { select: { number: true } } } });
  return NextResponse.json(updated);
}
