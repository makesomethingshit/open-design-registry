import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { proposalApplySchema, proposalCloseSchema, proposalCreateSchema, proposalReviewSchema, issueCommentSchema } from "./project-validation";
import { proposalCanBeReviewed, proposalStatusForChanges } from "./proposal-status";
import { deleteObject, publicAssetUrl } from "./storage";
import { putRevisionBundle, readRevisionBundle, type RevisionBundle } from "./revision-bundle";

const proposalDetails = {
  project: { select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } },
  baseRevision: { select: { id: true, projectId: true, number: true, title: true, isPublished: true, sourceKey: true, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, key: true, url: true, mimeType: true, altText: true } } } },
  sourceRevision: { select: { id: true, projectId: true, number: true, title: true, isPublished: true, sourceKey: true, project: { select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } }, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, key: true, url: true, mimeType: true, altText: true } } } },
  author: { select: { id: true, name: true } },
  relatedIssue: { select: { id: true, title: true, status: true } },
  reviewer: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true } },
  changeSet: { include: { changes: { orderBy: { createdAt: "asc" }, include: { reviewedBy: { select: { id: true, name: true } }, appliedRevision: { select: { id: true, number: true, title: true } }, reviewHistory: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } } } } } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
  appliedRevisions: { orderBy: { number: "asc" }, select: { id: true, number: true, title: true } },
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

type LockedProject = { id: string; ownerId: string; license: string; isPublic: boolean };

async function lockProjects(tx: Prisma.TransactionClient, projectIds: string[]) {
  const projects = new Map<string, LockedProject>();
  for (const projectId of [...new Set(projectIds)].sort()) {
    const [project] = await tx.$queryRaw<LockedProject[]>`SELECT id, "ownerId", license, "isPublic" FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    if (project) projects.set(project.id, project);
  }
  return projects;
}

export async function findVisibleProposal(id: string, userId?: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id }, include: proposalDetails });
  return proposal && isVisible(proposal, userId) ? proposal : null;
}

export async function listVisibleProjectProposals(projectId: string, userId?: string) {
  const proposals = await prisma.proposal.findMany({ where: { projectId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: proposalDetails });
  return proposals.filter((proposal) => isVisible(proposal, userId));
}

export function publicProposal(proposal: ProposalDetails) {
  return {
    id: proposal.id,
    proposalNumber: proposal.proposalNumber,
    title: proposal.title,
    body: proposal.body,
    status: proposal.status,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    project: { slug: proposal.project.slug, title: proposal.project.title },
    baseRevision: { id: proposal.baseRevision.id, number: proposal.baseRevision.number, title: proposal.baseRevision.title, previews: proposal.baseRevision.previews.map(({ key: _key, ...preview }) => ({ ...preview, url: publicAssetUrl(preview.url) })) },
    sourceRevision: { id: proposal.sourceRevision.id, number: proposal.sourceRevision.number, title: proposal.sourceRevision.title, project: { slug: proposal.sourceRevision.project.slug, title: proposal.sourceRevision.project.title }, previews: proposal.sourceRevision.previews.map(({ key: _key, ...preview }) => ({ ...preview, url: publicAssetUrl(preview.url) })) },
    author: proposal.author,
    relatedIssue: proposal.relatedIssue,
    reviewer: proposal.reviewer,
    acceptedBy: proposal.acceptedBy,
    changeSet: proposal.changeSet && { id: proposal.changeSet.id, changes: proposal.changeSet.changes.map((change) => ({
      id: change.id,
      type: change.type,
      target: change.target,
      targetFileId: change.targetFileId,
      name: change.name,
      mimeType: change.mimeType,
      size: change.size,
      reviewStatus: change.reviewStatus,
      reviewComment: change.reviewComment,
      reviewedAt: change.reviewedAt,
      reviewedBy: change.reviewedBy,
      appliedRevision: change.appliedRevision ?? (change.type === "REPLACE_DOCUMENT" ? proposal.appliedRevisions[0] ?? null : null),
      reviewHistory: change.reviewHistory,
    })) },
    comments: proposal.comments,
    appliedRevisions: proposal.appliedRevisions,
  };
}

export async function listProjectProposals(request: Request, scope: { slug: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  const project = await prisma.project.findUnique({ where: { slug: scope.slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project || !canReadProject(project, session?.user.id)) return error("Project not found", 404);
  const searchParams = new URL(request.url).searchParams;
  const filter = searchParams.get("status");
  if (filter && filter !== "open" && filter !== "closed") return error("Proposal status filter is invalid");
  const limitValue = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 20;
  const cursor = searchParams.get("cursor");
  const proposals = await listVisibleProjectProposals(project.id, session?.user.id);
  const filtered = filter === "open"
    ? proposals.filter((proposal) => ["OPEN", "CHANGES_REQUESTED", "APPROVED", "PARTIALLY_ACCEPTED"].includes(proposal.status))
    : filter === "closed"
      ? proposals.filter((proposal) => ["ACCEPTED", "CLOSED"].includes(proposal.status))
      : proposals;
  const start = cursor ? filtered.findIndex((proposal) => proposal.id === cursor) + 1 : 0;
  const page = filtered.slice(Math.max(0, start), Math.max(0, start) + limit);
  const nextCursor = filtered.length > start + page.length ? page.at(-1)?.id ?? null : null;
  if (!filter && !searchParams.has("cursor") && !searchParams.has("limit")) return NextResponse.json(page.map(publicProposal));
  return NextResponse.json({ items: page.map(publicProposal), nextCursor, total: filtered.length });
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
    prisma.revision.findFirst({ where: { id: input.baseRevisionId, projectId: project.id, isPublished: true }, select: { id: true, sourceKey: true } }),
    prisma.revision.findUnique({ where: { id: input.sourceRevisionId }, include: { project: { select: { id: true, ownerId: true } } } }),
  ]);
  if (!baseRevision) return error("Base revision not found", 400);
  if (!sourceRevision?.isPublished || sourceRevision.project.ownerId !== session.user.id) return error("Source revision not found", 400);
  const [baseBundle, sourceBundle] = await Promise.all([readRevisionBundle(baseRevision.sourceKey), readRevisionBundle(sourceRevision.sourceKey)]);
  if (!baseBundle || !sourceBundle) return error("This revision needs a file bundle before individual files can be replaced.", 409);
  const targetFiles = new Map(baseBundle.files.map((file) => [file.id, file]));
  const sourceFiles = new Map(sourceBundle.files.map((file) => [file.id, file]));
  const targetIds = input.files.map((file) => file.targetFileId);
  if (new Set(targetIds).size !== targetIds.length) return error("Each target file can be replaced only once", 400);
  const changes = input.files.map((file) => {
    const sourceFile = sourceFiles.get(file.sourceFileId);
    const targetFile = targetFiles.get(file.targetFileId);
    if (!sourceFile || !targetFile) return null;
    return { type: "REPLACE_ASSET" as const, target: targetFile.name, targetFileId: targetFile.id, name: sourceFile.name, mimeType: sourceFile.mimeType, size: sourceFile.size, assetKey: sourceFile.assetKey };
  });
  if (changes.some((change) => !change)) return error("Selected files no longer match their published revisions", 400);
  const relatedIssueId = input.relatedIssueId || undefined;
  if (relatedIssueId) {
    const relatedIssue = await prisma.issue.findFirst({ where: { id: relatedIssueId, projectId: project.id }, select: { id: true } });
    if (!relatedIssue) return error("Related issue not found", 400);
  }
  const proposal = await prisma.$transaction(async (tx) => {
    const lockedProjects = await lockProjects(tx, [project.id, sourceRevision.project.id]);
    if (!lockedProjects.has(project.id) || !lockedProjects.has(sourceRevision.project.id)) throw new Error("Project not found");
    const [lockedBase, lockedSource] = await Promise.all([
      tx.revision.findFirst({ where: { id: baseRevision.id, projectId: project.id, isPublished: true }, select: { id: true } }),
      tx.revision.findFirst({ where: { id: sourceRevision.id, projectId: sourceRevision.project.id, isPublished: true }, select: { id: true } }),
    ]);
    if (!lockedBase || !lockedSource) throw new Error("Revision not found");
    const latestProposal = await tx.proposal.findFirst({ where: { projectId: project.id }, orderBy: { proposalNumber: "desc" }, select: { proposalNumber: true } });
    return tx.proposal.create({
      data: {
        projectId: project.id,
        proposalNumber: (latestProposal?.proposalNumber ?? 0) + 1,
        baseRevisionId: baseRevision.id,
        sourceRevisionId: sourceRevision.id,
        authorId: session.user.id,
        relatedIssueId,
        title: input.title,
        body: input.body,
        changeSet: { create: { changes: { create: changes as Array<NonNullable<typeof changes[number]>> } } },
      },
      include: proposalDetails,
    });
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
  const parsed = proposalCloseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Status must be CLOSED");
  const initial = await prisma.proposal.findUnique({ where: { id: scope.id }, select: { projectId: true } });
  if (!initial) return error("Proposal not found", 404);
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const lockedProjects = await lockProjects(tx, [initial.projectId]);
      if (!lockedProjects.has(initial.projectId)) throw new ProposalError("Proposal not found", 404);
      const proposal = await tx.proposal.findUnique({ where: { id: scope.id }, include: proposalDetails });
      if (!proposal || !isVisible(proposal, session.user.id)) throw new ProposalError("Proposal not found", 404);
      if (proposal.authorId !== session.user.id && proposal.project.ownerId !== session.user.id) throw new ProposalError("Only the contributor or project owner can close a proposal", 403);
      if (proposal.status === "ACCEPTED") throw new ProposalError("Accepted proposals cannot be closed", 409);
      return tx.proposal.update({ where: { id: proposal.id }, data: { status: "CLOSED" }, include: proposalDetails });
    });
    return NextResponse.json(publicProposal(updated));
  } catch (cause) {
    if (cause instanceof ProposalError) return error(cause.message, cause.status, cause.details);
    console.error("proposal close failed", cause);
    return error("Proposal could not be closed", 500);
  }
}

export async function postProposalComment(request: Request, scope: { id: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const proposal = await findVisibleProposal(scope.id, session.user.id);
  if (!proposal) return error("Proposal not found", 404);
  if (proposal.status === "CLOSED") return error("Proposal is closed", 409);
  const parsed = issueCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Comment body is required");
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.proposalComment.create({ data: { proposalId: proposal.id, authorId: session.user.id, body: parsed.data.body }, include: { author: { select: { id: true, name: true } } } });
    await tx.proposal.update({ where: { id: proposal.id }, data: { updatedAt: new Date() } });
    return created;
  });
  return NextResponse.json(comment, { status: 201 });
}

export async function reviewProposalChange(request: Request, scope: { id: string; changeId: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const parsed = proposalReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("A review status is required; change requests need a comment");
  const initial = await prisma.proposal.findUnique({ where: { id: scope.id }, select: { projectId: true } });
  if (!initial) return error("Proposal not found", 404);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockedProjects = await lockProjects(tx, [initial.projectId]);
      if (!lockedProjects.has(initial.projectId)) throw new ProposalError("Proposal not found", 404);
      const proposal = await tx.proposal.findUnique({ where: { id: scope.id }, include: proposalDetails });
      if (!proposal || !isVisible(proposal, session.user.id)) throw new ProposalError("Proposal not found", 404);
      if (proposal.project.ownerId !== session.user.id) throw new ProposalError("Only the project owner can review changes", 403);
      if (!proposal.changeSet || !proposalCanBeReviewed(proposal.status)) throw new ProposalError("Proposal cannot be reviewed", 409);
      const change = proposal.changeSet.changes.find((candidate) => candidate.id === scope.changeId);
      if (!change) throw new ProposalError("Change not found", 404);
      if (change.appliedRevisionId) throw new ProposalError("Applied changes cannot be reviewed", 409);
      const reviewedAt = new Date();
      const reviewed = await tx.change.update({ where: { id: change.id }, data: { reviewStatus: parsed.data.status, reviewComment: parsed.data.comment || null, reviewedById: session.user.id, reviewedAt } });
      await tx.changeReview.create({ data: { changeId: change.id, authorId: session.user.id, status: parsed.data.status, comment: parsed.data.comment || null, createdAt: reviewedAt } });
      const changes = await tx.change.findMany({ where: { changeSetId: proposal.changeSet.id }, select: { reviewStatus: true, appliedRevisionId: true } });
      const status = proposalStatusForChanges(changes.map((item) => item.reviewStatus), changes.filter((item) => item.appliedRevisionId).length);
      await tx.proposal.update({ where: { id: proposal.id }, data: { status, reviewerId: session.user.id } });
      return reviewed;
    });
    return NextResponse.json(result);
  } catch (cause) {
    if (cause instanceof ProposalError) return error(cause.message, cause.status, cause.details);
    console.error("proposal review failed", cause);
    return error("Proposal could not be reviewed", 500);
  }
}

type ProposalFailureDetails = { latestRevision?: { id: string; number: number } };
class ProposalError extends Error {
  constructor(message: string, readonly status: number, readonly details?: ProposalFailureDetails) { super(message); }
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function selectiveBundle(latest: RevisionBundle, source: RevisionBundle, changes: Array<{ targetFileId: string; assetKey: string; mimeType: string; size: number }>) {
  const replacements = new Map(changes.map((change) => [change.targetFileId, change]));
  const sourceFiles = new Map(source.files.map((file) => [file.assetKey, file]));
  const files = latest.files.map((file) => {
    const replacement = replacements.get(file.id);
    if (!replacement) return file;
    const sourceFile = sourceFiles.get(replacement.assetKey);
    if (!sourceFile) throw new ProposalError("A selected source file is no longer available", 409);
    return { ...file, mimeType: replacement.mimeType, size: replacement.size, assetKey: replacement.assetKey, previewKeys: sourceFile.previewKeys };
  });
  if (files.length !== latest.files.length || replacements.size !== changes.length || changes.some((change) => !latest.files.some((file) => file.id === change.targetFileId))) throw new ProposalError("A selected target file is no longer available", 409);
  return { version: 1 as const, files };
}

export async function applyProposal(request: Request, scope: { id: string }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const parsed = proposalApplySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return error("Latest revision confirmation is invalid");
  const initial = await prisma.proposal.findUnique({ where: { id: scope.id }, select: { projectId: true, sourceRevision: { select: { projectId: true } } } });
  if (!initial) return error("Proposal not found", 404);
  let uploadedBundleKey: string | undefined;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const lockedProjects = await lockProjects(tx, [initial.projectId, initial.sourceRevision.projectId]);
      const lockedProject = lockedProjects.get(initial.projectId);
      if (!lockedProject) throw new ProposalError("Proposal not found", 404);
      if (lockedProject.ownerId !== session.user.id) throw new ProposalError("Only the project owner can apply approved changes", 403);
      const proposal = await tx.proposal.findUnique({
        where: { id: scope.id },
        include: {
          baseRevision: { select: { id: true, projectId: true, isPublished: true } },
          sourceRevision: { include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } },
          changeSet: { include: { changes: { include: { appliedRevision: { select: { id: true, number: true, title: true } } } } } },
          appliedRevisions: { orderBy: { number: "asc" }, select: { id: true, number: true, title: true } },
        },
      });
      if (!proposal) throw new ProposalError("Proposal not found", 404);
      const sourceProject = lockedProjects.get(proposal.sourceRevision.projectId);
      if (!proposal.baseRevision.isPublished || proposal.baseRevision.projectId !== initial.projectId || proposal.sourceRevision.projectId !== initial.sourceRevision.projectId || !sourceProject || !proposal.sourceRevision.isPublished || !canReadProject(sourceProject, session.user.id)) throw new ProposalError("Proposal source is not available", 404);
      if (!proposal.changeSet) throw new ProposalError("Proposal has no changes", 409);
      const requestedIds = parsed.data.changeIds;
      if (new Set(requestedIds).size !== requestedIds.length) throw new ProposalError("Each change can be selected only once", 400);
      const selected = proposal.changeSet.changes.filter((change) => requestedIds.includes(change.id));
      if (selected.length !== requestedIds.length) throw new ProposalError("A selected change was not found", 404);
      const legacyChange = selected.length === 1 && selected[0].type === "REPLACE_DOCUMENT" && selected[0].target === "whole_document";
      if (legacyChange && proposal.appliedRevisions[0]) return { revision: proposal.appliedRevisions[0], alreadyApplied: true };
      if (selected.every((change) => change.appliedRevisionId)) {
        const revisionId = selected[0].appliedRevisionId;
        if (revisionId && selected.every((change) => change.appliedRevisionId === revisionId)) {
          const revision = await tx.revision.findUnique({ where: { id: revisionId }, select: { id: true, number: true, title: true } });
          if (revision) return { revision, alreadyApplied: true };
        }
      }
      if (selected.some((change) => change.appliedRevisionId)) throw new ProposalError("One or more selected changes were already applied", 409);
      if (proposal.status === "CLOSED" || proposal.status === "ACCEPTED") throw new ProposalError("Proposal cannot be applied", 409);
      if (selected.some((change) => change.reviewStatus !== "APPROVED")) throw new ProposalError("Only approved changes can be applied", 409);
      const latest = await tx.revision.findFirst({ where: { projectId: initial.projectId, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true } });
      if (!latest) throw new ProposalError("Current revision not found", 409);
      if (latest.id !== proposal.baseRevisionId && (parsed.data.reviewedLatestRevisionId !== latest.id || !sameIds(parsed.data.reviewedChangeIds ?? [], requestedIds))) throw new ProposalError("Review the latest revision before applying these selected changes", 409, { latestRevision: latest });
      const source = proposal.sourceRevision;
      if (legacyChange) {
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
        await tx.change.update({ where: { id: selected[0].id }, data: { appliedRevisionId: revision.id } });
        await tx.proposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED", acceptedById: session.user.id } });
        return { revision, alreadyApplied: false };
      }
      const assetChanges = selected.map((change) => {
        if (change.type !== "REPLACE_ASSET" || !change.targetFileId || !change.assetKey || !change.mimeType || change.size == null) throw new ProposalError("Selected changes are not file replacements", 409);
        return { targetFileId: change.targetFileId, assetKey: change.assetKey, mimeType: change.mimeType, size: change.size };
      });
      const latestWithSource = await tx.revision.findUnique({ where: { id: latest.id }, include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } });
      const [latestBundle, sourceBundle] = await Promise.all([readRevisionBundle(latestWithSource?.sourceKey), readRevisionBundle(source.sourceKey)]);
      if (!latestWithSource || !latestBundle || !sourceBundle) throw new ProposalError("This revision needs a file bundle before individual files can be replaced.", 409);
      const bundle = selectiveBundle(latestBundle, sourceBundle, assetChanges);
      const previewByKey = new Map([...latestWithSource.previews, ...source.previews].map((preview) => [preview.key, preview]));
      const previewKeys = [...new Set(bundle.files.flatMap((file) => file.previewKeys))];
      const previews = previewKeys.map((key) => previewByKey.get(key)).filter((preview): preview is NonNullable<typeof preview> => Boolean(preview)).map((preview, position) => ({ ...preview, position }));
      if (!previews.length || previews.length !== previewKeys.length) throw new ProposalError("Selected files are missing preview mappings", 409);
      uploadedBundleKey = `revisions/${initial.projectId}/${crypto.randomUUID()}/bundle.json`;
      const { checksum } = await putRevisionBundle(uploadedBundleKey, bundle);
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: initial.projectId,
          number: latest.number + 1,
          parentId: latest.id,
          title: `Accepted: ${proposal.title}`.slice(0, 120),
          changeDescription: `Applied ${selected.length} ${selected.length === 1 ? "file" : "files"} from Proposal #${proposal.proposalNumber}`,
          license: lockedProject.license,
          sourceKey: uploadedBundleKey,
          sourceUrl: null,
          tool: latestWithSource.tool,
          toolVersion: latestWithSource.toolVersion,
          tags: latestWithSource.tags,
          sourceChecksum: checksum,
          sourceProposalId: proposal.id,
          isPublished: false,
          previews: { create: previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
        },
      });
      const revision = await tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, select: { id: true, number: true, title: true } });
      await tx.change.updateMany({ where: { id: { in: requestedIds } }, data: { appliedRevisionId: revision.id } });
      await tx.change.updateMany({ where: { changeSetId: proposal.changeSet.id, appliedRevisionId: null, id: { notIn: requestedIds } }, data: { reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null } });
      const appliedCount = proposal.changeSet.changes.filter((change) => change.appliedRevisionId).length + selected.length;
      await tx.proposal.update({ where: { id: proposal.id }, data: { status: proposalStatusForChanges(proposal.changeSet.changes.map((change) => change.reviewStatus), appliedCount), acceptedById: session.user.id } });
      return { revision, alreadyApplied: false };
    });
    return NextResponse.json(result, { status: result.alreadyApplied ? 200 : 201 });
  } catch (cause) {
    if (uploadedBundleKey) await deleteObject(uploadedBundleKey).catch(() => undefined);
    if (cause instanceof ProposalError) return error(cause.message, cause.status, cause.details);
    console.error("proposal apply failed", cause);
    return error("Proposal could not be applied", 500);
  }
}
