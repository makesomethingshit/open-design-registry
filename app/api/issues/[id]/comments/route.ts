import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { issueCommentSchema } from "@/src/lib/project-validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { id } = await params;
  const issue = await prisma.issue.findUnique({ where: { id }, select: { project: { select: { isPublic: true } }, status: true } });
  if (!issue || !issue.project.isPublic) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const parsed = issueCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  const comment = await prisma.issueComment.create({ data: { issueId: id, authorId: session.user.id, body: parsed.data.body }, include: { author: { select: { id: true, name: true } } } });
  return NextResponse.json(comment, { status: 201 });
}
