import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";

async function findIssue(slug: string, id: string) {
  return prisma.issue.findFirst({ where: { id, project: { slug } }, include: { project: { select: { ownerId: true, isPublic: true, slug: true } }, author: { select: { id: true, name: true } }, revision: { select: { number: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } } } });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const issue = await findIssue(slug, id);
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!issue.project.isPublic && session?.user.id !== issue.project.ownerId) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  return NextResponse.json(issue);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { slug, id } = await params;
  const issue = await findIssue(slug, id);
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (session.user.id !== issue.project.ownerId) return NextResponse.json({ error: "Only the project owner can change issue status" }, { status: issue.project.isPublic ? 403 : 404 });
  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  if (body?.status !== "OPEN" && body?.status !== "CLOSED") return NextResponse.json({ error: "Status must be OPEN or CLOSED" }, { status: 400 });
  const status = body.status;
  return NextResponse.json(await prisma.issue.update({ where: { id }, data: { status, closedAt: status === "CLOSED" ? new Date() : null, closedBy: status === "CLOSED" ? session.user.id : null }, include: { author: { select: { id: true, name: true } }, revision: { select: { number: true } } } }));
}
