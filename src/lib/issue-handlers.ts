import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { issueCommentSchema, issueStatusSchema } from "./project-validation";

type IssueScope = { id: string; slug?: string };

const issueDetails = {
  project: { select: { ownerId: true, isPublic: true, slug: true } },
  author: { select: { id: true, name: true } },
  revision: { select: { number: true } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
} satisfies Prisma.IssueInclude;

const issueAccess = {
  project: { select: { ownerId: true, isPublic: true } },
} satisfies Prisma.IssueSelect;

const commentAccess = {
  status: true,
  project: { select: { isPublic: true } },
} satisfies Prisma.IssueSelect;

export async function getIssue(request: Request, scope: IssueScope): Promise<NextResponse> {
  const issue = scope.slug
    ? await prisma.issue.findFirst({ where: { id: scope.id, project: { slug: scope.slug } }, include: issueDetails })
    : await prisma.issue.findUnique({ where: { id: scope.id }, include: issueDetails });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!issue.project.isPublic && session?.user.id !== issue.project.ownerId) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  return NextResponse.json(issue);
}

export async function patchIssue(request: Request, scope: IssueScope): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const issue = scope.slug
    ? await prisma.issue.findFirst({ where: { id: scope.id, project: { slug: scope.slug } }, select: issueAccess })
    : await prisma.issue.findUnique({ where: { id: scope.id }, select: issueAccess });
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (session.user.id !== issue.project.ownerId) return NextResponse.json({ error: "Only the project owner can change issue status" }, { status: issue.project.isPublic ? 403 : 404 });
  const parsed = issueStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Status must be OPEN or CLOSED" }, { status: 400 });
  const { status } = parsed.data;
  const updated = await prisma.issue.update({
    where: { id: scope.id },
    data: { status, closedAt: status === "CLOSED" ? new Date() : null, closedBy: status === "CLOSED" ? session.user.id : null },
    include: { author: { select: { id: true, name: true } }, revision: { select: { number: true } } },
  });
  return NextResponse.json(updated);
}

export async function postIssueComment(request: Request, scope: IssueScope): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const issue = scope.slug
    ? await prisma.issue.findFirst({ where: { id: scope.id, project: { slug: scope.slug, isPublic: true } }, select: commentAccess })
    : await prisma.issue.findUnique({ where: { id: scope.id }, select: commentAccess });
  if (!issue || !issue.project.isPublic) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  if (issue.status === "CLOSED") return NextResponse.json({ error: "Issue is closed" }, { status: 409 });
  const parsed = issueCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  const comment = await prisma.issueComment.create({
    data: { issueId: scope.id, authorId: session.user.id, body: parsed.data.body },
    include: { author: { select: { id: true, name: true } } },
  });
  return NextResponse.json(comment, { status: 201 });
}
