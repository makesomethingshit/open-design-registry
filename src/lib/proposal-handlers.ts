import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { proposalApplySchema, proposalCloseSchema, proposalCreateSchema, proposalReviewSchema, issueCommentSchema } from "./project-validation";
import { proposalCanBeReviewed, proposalStatusForChanges } from "./proposal-status";
import { publicAssetUrl } from "./storage";

const proposalDetails = {
  project: { select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } },
  baseRevision: { select: { id: true, projectId: true, number: true, title: true, isPublished: true, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, url: true, mimeType: true, altText: true } } } },
  sourceRevision: { select: { id: true, projectId: true, number: true, title: true, isPublished: true, project: { select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } }, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, url: true, mimeType: true, altText: true } } } },
  author: { select: { id: true, name: true } },
  relatedIssue: { select: { id: true, title: true, status: true } },
  reviewer: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true } },
  changeSet: { include: { changes: { orderBy: { createdAt: "asc" }, include: { reviewedBy: { select: { id: true, name: true } } } } } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
  appliedRevision: { select: { id: true, number: true, title: true } },
} satisfies Prisma.ProposalInclude;

export type ProposalDetails = Prisma.ProposalGetPayload<{ include: typeof proposalDetails }>;

function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function canReadProject(project: { isPublic: boolean; ownerId: string }, userId?: string) {
  return project.isPublic || project.ownerId === userId;
}

function isVisible(proposal: ProposalDetails, userId?: string) {
  return proposal.baseRevision.projectId === proposal.project.id
    && proposal.baseRevision.isPublished
    && proposal.sourceRevision.isPublished
    && canReadProject(proposal.project, userId)
    && canReadProject(proposal.sourceRevision.project, userId);
}

export async function findVisibleProposal(id: string, userId?: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id }, include: proposalDetails });
  return proposal && isVisible(proposal, userId) ? proposal : null;
}

export async function listVisibleProjectProposals(projectId: string, userId?: string) {
  const proposals = await prisma.proposal.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, include: proposalDetails });
  return proposals.filter((proposal) => isVisible(proposal, userId));
}

export function publicProposal(proposal: ProposalDetails) {
  return {
    id: proposal.id,
    title: proposal.title,
    body: proposal.body,
    status: proposal.status,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    project: { slug: proposal.project.slug, title: proposal.project.title },
    baseRevision: { id: proposal.baseRevision.id, number: proposal.baseRevision.number, title: proposal.baseRevision.title, previews: proposal.baseRevision.previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) })) },
    sourceRevision: { id: proposal.sourceRevision.id, number: proposal.sourceRevision.number, title: proposal.sourceRevision.title, project: { slug: proposal.sourceRevision.project.slug, title: proposal.sourceRevision.project.title }, previews: proposal.sourceRevision.previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) })) },
    author: proposal.author,
    relatedIssue: proposal.relatedIssue,
    reviewer: proposal.reviewer,
    acceptedBy: proposal.acceptedBy,
    changeSet: proposal.changeSet && { id: proposal.changeSet.id, changes: proposal.changeSet.changes.map((change) => ({ id: change.id, type: change.type, target: change.target, reviewStatus: change.reviewStatus, reviewComment: change.reviewComment, reviewedAt: change.reviewedAt, reviewedBy: change.reviewedBy })) },
    comments: proposal.comments,
    appliedRevision: proposal.appliedRevision,
  };
}

export async function listProjectProposals(request: Request, scope: { slug: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  const project = await prisma.project.findUnique({ where: { slug: scope.slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project || !canReadProject(project, session?.user.id)) return error("Project not found", 404);
  const proposals = await listVisibleProjectProposals(project.id, session?.user.id);
  return NextResponse.json(proposals.map(publicProposal));
}

export async function createProjectProposal(request: Request, scope: { slug: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const project = await prisma.project.findUnique({ where: { slug: scope.slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project || !canReadProject(project, session.user.id)) return error("Project not found", 404);
  const parsed = proposalCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Proposal title, description, or revisions are invalid");
  const input = parsed.data;
  const [baseRevision, sourceRevision] = await Promise.all([
    prisma.revision.findFirst({ where: { id: input.baseRevisionId, projectId: project.id, isPublished: true }, select: { id: true } }),
    prisma.revision.findUnique({ where: { id: input.sourceRevisionId }, include: { project: { select: { ownerId: true } } } }),
  ]);
  if (!baseRevision) return error("Base revision not found", 400);
  if (!sourceRevision?.isPublished || sourceRevision.project.ownerId !== session.user.id) return error("Source revision not found", 400);
  const relatedIssueId = input.relatedIssueId || undefined;
  if (relatedIssueId) {
    const relatedIssue = await prisma.issue.findFirst({ where: { id: relatedIssueId, projectId: project.id }, select: { id: true } });
    if (!relatedIssue) return error("Related issue not found", 400);
  }
  const proposal = await prisma.proposal.create({
    data: {
      projectId: project.id,
      baseRevisionId: baseRevision.id,
      sourceRevisionId: sourceRevision.id,
      authorId: session.user.id,
      relatedIssueId,
      title: input.title,
      body: input.body,
      changeSet: { create: { changes: { create: { type: "REPLACE_DOCUMENT", target: "whole_document" } } } },
    },
    include: proposalDetails,
  });
  return NextResponse.json(publicProposal(proposal), { status: 201 });
}

export async function getProposal(request: Request, scope: { id: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  const proposal = await findVisibleProposal(scope.id, session?.user.id);
  return proposal ? NextResponse.json(publicProposal(proposal)) : error("Proposal not found", 404);
}

export async function closeProposal(request: Request, scope: { id: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const proposal = await findVisibleProposal(scope.id, session.user.id);
  if (!proposal) return error("Proposal not found", 404);
  if (proposal.authorId !== session.user.id && proposal.project.ownerId !== session.user.id) return error("Only the contributor or project owner can close a proposal", 403);
  if (proposal.status === "ACCEPTED") return error("Accepted proposals cannot be closed", 409);
  const parsed = proposalCloseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Status must be CLOSED");
  const updated = await prisma.proposal.update({ where: { id: proposal.id }, data: { status: "CLOSED" }, include: proposalDetails });
  return NextResponse.json(publicProposal(updated));
}

export async function postProposalComment(request: Request, scope: { id: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const proposal = await findVisibleProposal(scope.id, session.user.id);
  if (!proposal) return error("Proposal not found", 404);
  if (proposal.status === "CLOSED") return error("Proposal is closed", 409);
  const parsed = issueCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Comment body is required");
  const comment = await prisma.proposalComment.create({ data: { proposalId: proposal.id, authorId: session.user.id, body: parsed.data.body }, include: { author: { select: { id: true, name: true } } } });
  return NextResponse.json(comment, { status: 201 });
}

export async function reviewProposalChange(request: Request, scope: { id: string; changeId: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const proposal = await findVisibleProposal(scope.id, session.user.id);
  if (!proposal) return error("Proposal not found", 404);
  if (proposal.project.ownerId !== session.user.id) return error("Only the project owner can review changes", 403);
  if (!proposal.changeSet || !proposalCanBeReviewed(proposal.status)) return error("Proposal cannot be reviewed", 409);
  const parsed = proposalReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("A review status is required; change requests need a comment");
  const change = proposal.changeSet.changes.find((candidate) => candidate.id === scope.changeId);
  if (!change) return error("Change not found", 404);
  const result = await prisma.$transaction(async (tx) => {
    const reviewed = await tx.change.update({ where: { id: change.id }, data: { reviewStatus: parsed.data.status, reviewComment: parsed.data.comment || null, reviewedById: session.user.id, reviewedAt: new Date() } });
    const changes = await tx.change.findMany({ where: { changeSetId: proposal.changeSet!.id }, select: { reviewStatus: true } });
    const status = proposalStatusForChanges(changes.map((item) => item.reviewStatus));
    await tx.proposal.update({ where: { id: proposal.id }, data: { status, reviewerId: session.user.id } });
    return reviewed;
  });
  return NextResponse.json(result);
}

type ApplyFailureDetails = { latestRevision?: { id: string; number: number } };
class ApplyError extends Error {
  constructor(message: string, readonly status: number, readonly details?: ApplyFailureDetails) { super(message); }
}

export async function applyProposal(request: Request, scope: { id: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const parsed = proposalApplySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return error("Latest revision confirmation is invalid");
  const initial = await prisma.proposal.findUnique({ where: { id: scope.id }, select: { projectId: true } });
  if (!initial) return error("Proposal not found", 404);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [lockedProject] = await tx.$queryRaw<Array<{ id: string; ownerId: string; license: string }>>`SELECT id, "ownerId", license FROM "Project" WHERE id = ${initial.projectId} FOR UPDATE`;
      if (!lockedProject) throw new ApplyError("Proposal not found", 404);
      if (lockedProject.ownerId !== session.user.id) throw new ApplyError("Only the project owner can apply approved changes", 403);
      const proposal = await tx.proposal.findUnique({
        where: { id: scope.id },
        include: {
          baseRevision: { select: { id: true, projectId: true, isPublished: true } },
          sourceRevision: { include: { project: { select: { ownerId: true, isPublic: true } }, previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } },
          changeSet: { include: { changes: true } },
          appliedRevision: { select: { id: true, number: true, title: true } },
        },
      });
      if (!proposal) throw new ApplyError("Proposal not found", 404);
      if (proposal.appliedRevision) return { revision: proposal.appliedRevision, alreadyApplied: true };
      if (proposal.status !== "APPROVED" || proposal.changeSet?.changes.length !== 1 || proposal.changeSet.changes[0].type !== "REPLACE_DOCUMENT" || proposal.changeSet.changes[0].target !== "whole_document" || proposal.changeSet.changes[0].reviewStatus !== "APPROVED") throw new ApplyError("The whole-document change must be approved before it can be applied", 409);
      if (!proposal.baseRevision.isPublished || proposal.baseRevision.projectId !== initial.projectId || !proposal.sourceRevision.isPublished || !canReadProject(proposal.sourceRevision.project, session.user.id)) throw new ApplyError("Proposal source is not available", 404);
      const latest = await tx.revision.findFirst({ where: { projectId: initial.projectId, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true } });
      if (!latest) throw new ApplyError("Current revision not found", 409);
      if (latest.id !== proposal.baseRevisionId && parsed.data.reviewedLatestRevisionId !== latest.id) throw new ApplyError("Review the latest revision before applying this proposal", 409, { latestRevision: latest });
      const source = proposal.sourceRevision;
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: initial.projectId,
          number: latest.number + 1,
          parentId: latest.id,
          title: `Accepted: ${proposal.title}`.slice(0, 120),
          changeDescription: proposal.body.slice(0, 500),
          license: lockedProject.license,
          sourceKey: source.sourceKey,
          sourceUrl: source.sourceUrl,
          tool: source.tool,
          toolVersion: source.toolVersion,
          tags: source.tags,
          sourceChecksum: source.sourceChecksum,
          sourceProposalId: proposal.id,
          isPublished: false,
          previews: { create: source.previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
        },
      });
      const revision = await tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, select: { id: true, number: true, title: true } });
      await tx.proposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED", acceptedById: session.user.id } });
      return { revision, alreadyApplied: false };
    });
    return NextResponse.json(result, { status: result.alreadyApplied ? 200 : 201 });
  } catch (cause) {
    if (cause instanceof ApplyError) return error(cause.message, cause.status, cause.details);
    console.error("proposal apply failed", cause);
    return error("Proposal could not be applied", 500);
  }
}
