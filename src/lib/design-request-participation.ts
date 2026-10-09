import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { lockIssue } from "./issue-handlers";
import { prisma } from "./prisma";

type IssueScope = { id: string };
type ParticipationIssue = { kind: "ISSUE" | "DESIGN_REQUEST"; status: "OPEN" | "CLOSED"; project: { isPublic: boolean } };

export async function readDesignRequestParticipationSnapshot(tx: Prisma.TransactionClient, issueId: string, userId?: string) {
  const [count, participants, currentUser] = await Promise.all([
    tx.designRequestParticipation.count({ where: { issueId } }),
    tx.designRequestParticipation.findMany({ where: { issueId }, orderBy: [{ createdAt: "asc" }, { userId: "asc" }], take: 5, select: { user: { select: { name: true } } } }),
    userId ? tx.designRequestParticipation.findUnique({ where: { issueId_userId: { issueId, userId } }, select: { issueId: true } }) : Promise.resolve(null),
  ]);
  return { count, names: participants.map(({ user }) => user.name), participating: Boolean(currentUser) };
}

const participationAccess = {
  kind: true,
  status: true,
  project: { select: { isPublic: true } },
} satisfies Prisma.IssueSelect;

class ParticipationRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function errorResponse(error: ParticipationRequestError) {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

async function lockedIssue(tx: Prisma.TransactionClient, issueId: string) {
  await lockIssue(tx, issueId);
  return tx.issue.findUnique({ where: { id: issueId }, select: participationAccess }) as Promise<ParticipationIssue | null>;
}

function requirePublicDesignRequest(issue: ParticipationIssue | null) {
  if (!issue || !issue.project.isPublic || issue.kind !== "DESIGN_REQUEST") throw new ParticipationRequestError("Issue not found", 404);
  return issue;
}

export async function postDesignRequestParticipation(request: Request, scope: IssueScope): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const issue = requirePublicDesignRequest(await lockedIssue(tx, scope.id));
      if (issue.status === "CLOSED") throw new ParticipationRequestError("Issue is closed", 409);
      const existing = await tx.designRequestParticipation.findUnique({ where: { issueId_userId: { issueId: scope.id, userId: session.user.id } }, select: { issueId: true } });
      if (existing) return { created: false };
      await tx.designRequestParticipation.create({ data: { issueId: scope.id, userId: session.user.id } });
      return { created: true };
    });
    return NextResponse.json({ participating: true }, { status: result.created ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof ParticipationRequestError) return errorResponse(cause);
    throw cause;
  }
}

export async function deleteDesignRequestParticipation(request: Request, scope: IssueScope): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  try {
    await prisma.$transaction(async (tx) => {
      requirePublicDesignRequest(await lockedIssue(tx, scope.id));
      await tx.designRequestParticipation.deleteMany({ where: { issueId: scope.id, userId: session.user.id } });
    });
    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    if (cause instanceof ParticipationRequestError) return errorResponse(cause);
    throw cause;
  }
}
