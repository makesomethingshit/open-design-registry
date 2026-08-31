import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { issueCommentSchema } from "@/src/lib/project-validation";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { slug, id } = await params;
  const issue = await prisma.issue.findFirst({ where: { id, project: { slug, isPublic: true } }, select: { id: true } });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const parsed = issueCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  return NextResponse.json(await prisma.issueComment.create({ data: { issueId: id, authorId: session.user.id, body: parsed.data.body }, include: { author: { select: { id: true, name: true } } } }), { status: 201 });
}
