import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { proposalApplySchema, proposalCloseSchema, proposalCreateSchema, proposalReviewSchema, issueCommentSchema } from "./project-validation";
import { proposalCanBeReviewed, proposalStatusForChanges } from "./proposal-status";
import { deleteObject, publicAssetUrl } from "./storage";
import { normalizeUnitName, putRevisionBundle, readRevisionBundle, sameDependencySet, sameRevisionBundleContents, type RevisionBundle, type RevisionBundleFile } from "./revision-bundle";
import { changedUnitIds, conflictForChange } from "./proposal-conflicts";

const proposalDetails = {
  project: { select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } },
  baseRevision: { select: { id: true, projectId: true, number: true, title: true, isPublished: true, sourceKey: true, capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, key: true, url: true, mimeType: true, altText: true } } } },
  sourceRevision: { select: { id: true, projectId: true, number: true, title: true, isPublished: true, sourceKey: true, capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true, project: { select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } }, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, key: true, url: true, mimeType: true, altText: true } } } },
  author: { select: { id: true, name: true } },
  relatedIssue: { select: { id: true, title: true, kind: true, status: true, sourceDiscussion: { select: { id: true, title: true } } } },
  reviewer: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true } },
  changeSet: { include: { changes: { orderBy: { createdAt: "asc" }, include: { reviewedBy: { select: { id: true, name: true } }, appliedRevision: { select: { id: true, number: true, title: true } }, reviewHistory: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } }, causedByRevision: { select: { id: true, number: true } } } } } } } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true } } } },
  appliedRevisions: { orderBy: { number: "asc" }, select: { id: true, number: true, title: true } },
} satisfies Prisma.ProposalInclude;

export type ProposalDetails = Prisma.ProposalGetPayload<{ include: typeof proposalDetails }>;

const proposalSummary = {
  id: true,
  proposalNumber: true,
  title: true,
  status: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { name: true } },
  baseRevision: { select: { capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true } },
  changeSet: { select: { changes: { select: { id: true, type: true, action: true, target: true, name: true, newName: true, kind: true, reviewStatus: true, appliedRevisionId: true } } } },
} satisfies Prisma.ProposalSelect;

export type ProposalSummary = Prisma.ProposalGetPayload<{ select: typeof proposalSummary }>;

function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

function canReadProject(project: { isPublic: boolean; ownerId: string }, userId?: string) {
  return project.isPublic || project.ownerId === userId;
}

type ProposalVisibility = {
  project: { id: string; ownerId: string; isPublic: boolean };
  baseRevision: { projectId: string; isPublished: boolean };
  sourceRevision: { isPublished: boolean; project: { ownerId: string; isPublic: boolean } };
};

export function isVisible(proposal: ProposalVisibility, userId?: string) {
  return proposal.baseRevision.projectId === proposal.project.id
    && proposal.baseRevision.isPublished
    && proposal.sourceRevision.isPublished
    && canReadProject(proposal.project, userId)
    && canReadProject(proposal.sourceRevision.project, userId);
}

export function visibleProposalWhere(projectId: string, userId?: string): Prisma.ProposalWhereInput {
  return {
    projectId,
    baseRevision: { projectId, isPublished: true },
    sourceRevision: { isPublished: true, project: userId ? { OR: [{ isPublic: true }, { ownerId: userId }] } : { isPublic: true } },
  };
}

export function changeSummary(change: { type: string; action: string | null; target: string; name: string | null; newName: string | null }) {
  const action = change.action ?? change.type;
  const name = change.name ?? change.target;
  if (action === "RENAME_UNIT") return `Rename ${name} → ${change.newName ?? "new name"}`;
  if (action === "ADD_UNIT") return `Add ${name}`;
  if (action === "REMOVE_UNIT") return `Remove ${name}`;
  if (action === "MODIFY_UNIT") return `Modify ${name}`;
  return action === "REPLACE_DOCUMENT" ? "Whole document" : `Replace ${name}`;
}

export function publicProposalSummary(proposal: ProposalSummary) {
  const changes = proposal.changeSet?.changes ?? [];
  return {
    id: proposal.id,
    proposalNumber: proposal.proposalNumber,
    title: proposal.title,
    status: proposal.status,
    author: proposal.author.name,
    authorId: proposal.authorId,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    approved: changes.filter((change) => change.reviewStatus === "APPROVED" && !change.appliedRevisionId).length,
    applied: changes.filter((change) => Boolean(change.appliedRevisionId)).length,
    total: changes.length,
    summaries: changes.slice(0, 2).map(changeSummary),
    moreChanges: Math.max(0, changes.length - 2),
    capability: { mode: proposal.baseRevision.capabilityMode, unitCount: proposal.baseRevision.capabilityUnitCount, adapterId: proposal.baseRevision.adapterId, adapterVersion: proposal.baseRevision.adapterVersion, adapterConfidence: proposal.baseRevision.adapterConfidence, adapterMaturity: proposal.baseRevision.adapterMaturity },
  };
}

type LockedProject = { id: string; ownerId: string; license: string; isPublic: boolean };
type ProposalChangeData = Prisma.ChangeCreateWithoutChangeSetInput;
type UnitChangeRequest =
  | { action: "MODIFY_UNIT"; targetFileId: string; sourceFileId: string }
  | { action: "RENAME_UNIT"; targetFileId: string; newName: string }
  | { action: "REMOVE_UNIT"; targetFileId: string }
  | { action: "ADD_UNIT"; sourceFileId: string };

type SourceTargetChange = { type?: string; action?: string | null; targetFileId?: string | null; assetKey?: string | null };

type AppliedRevisionSnapshot = {
  sourceKey: string | null;
  sourceUrl: string | null;
  sourceChecksum: string | null;
  tool: string | null;
  toolVersion: string | null;
  tags: string[];
  capabilityMode: string | null;
  capabilityUnitCount: number | null;
  adapterId: string | null;
  adapterVersion: string | null;
  adapterConfidence: string | null;
  adapterMaturity: string | null;
  previews: Array<{ position: number; key: string; url: string; mimeType: string; size: number; altText: string }>;
};

function sourceMappings(source: RevisionBundle | null, changes: readonly SourceTargetChange[]) {
  const sourceFiles = new Map(source?.files.map((file) => [file.assetKey, file]) ?? []);
  const sourceToTargetId = new Map<string, string>();
  for (const change of changes) {
    if (!change.assetKey || !change.targetFileId) continue;
    const sourceFile = sourceFiles.get(change.assetKey);
    if (!sourceFile) continue;
    const existingTargetId = sourceToTargetId.get(sourceFile.id);
    if (source?.version === 3 && existingTargetId && existingTargetId !== change.targetFileId) {
      throw new ProposalError("A source unit cannot map to multiple target units", 409);
    }
    sourceToTargetId.set(sourceFile.id, change.targetFileId);
  }
  return { sourceFiles, sourceToTargetId };
}

function hasNoOpModifyUnit(base: RevisionBundle, source: RevisionBundle | null, changes: readonly SourceTargetChange[]) {
  const { sourceFiles, sourceToTargetId } = sourceMappings(source, changes);
  return changes.some((change) => {
    if ((change.action ?? change.type) !== "MODIFY_UNIT") return false;
    const target = base.files.find((file) => file.id === change.targetFileId);
    const sourceFile = change.assetKey ? sourceFiles.get(change.assetKey) : undefined;
    if (!target || !sourceFile || !target.checksum || !sourceFile.checksum
      || target.checksum.toLowerCase() !== sourceFile.checksum.toLowerCase()
      || target.mimeType !== sourceFile.mimeType || target.size !== sourceFile.size
      || target.previewKeys.length !== sourceFile.previewKeys.length
      || !target.previewKeys.every((key, index) => key === sourceFile.previewKeys[index])) return false;
    const dependencies = source?.version === 3
      ? sourceFile.dependencies!.map((id) => sourceToTargetId.get(id) ?? id)
      : target.dependencies;
    return sameDependencySet(target.dependencies, dependencies);
  });
}

function sameDocumentSource(left: AppliedRevisionSnapshot, right: AppliedRevisionSnapshot) {
  const sameChecksum = Boolean(left.sourceKey && right.sourceKey && left.sourceChecksum && right.sourceChecksum
    && left.sourceChecksum.toLowerCase() === right.sourceChecksum.toLowerCase());
  const sameKey = Boolean(left.sourceKey && left.sourceKey === right.sourceKey
    && (!left.sourceChecksum || !right.sourceChecksum || left.sourceChecksum.toLowerCase() === right.sourceChecksum.toLowerCase()));
  const sameUrl = Boolean(left.sourceUrl && left.sourceUrl === right.sourceUrl && left.sourceChecksum && right.sourceChecksum
    && left.sourceChecksum.toLowerCase() === right.sourceChecksum.toLowerCase());
  return sameKey || sameChecksum || sameUrl;
}

function sameAppliedDocument(left: AppliedRevisionSnapshot, right: AppliedRevisionSnapshot, leftBundle: RevisionBundle | null, rightBundle: RevisionBundle | null) {
  const sameUrlWithDifferentChecksums = Boolean(left.sourceUrl && left.sourceUrl === right.sourceUrl && left.sourceChecksum && right.sourceChecksum
    && left.sourceChecksum.toLowerCase() !== right.sourceChecksum.toLowerCase());
  if (sameUrlWithDifferentChecksums) return false;
  const sameSource = sameDocumentSource(left, right)
    || Boolean(leftBundle && rightBundle && sameRevisionBundleContents(leftBundle, rightBundle));
  if (!sameSource) return false;
  return left.tool === right.tool
    && left.toolVersion === right.toolVersion
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
    && left.capabilityMode === right.capabilityMode
    && left.capabilityUnitCount === right.capabilityUnitCount
    && left.adapterId === right.adapterId
    && left.adapterVersion === right.adapterVersion
    && left.adapterConfidence === right.adapterConfidence
    && left.adapterMaturity === right.adapterMaturity
    && left.previews.length === right.previews.length
    && left.previews.every((preview, index) => {
      const other = right.previews[index];
      return Boolean(other && preview.position === other.position && preview.key === other.key && preview.url === other.url
        && preview.mimeType === other.mimeType && preview.size === other.size && preview.altText === other.altText);
    });
}

async function lockProjects(tx: Prisma.TransactionClient, projectIds: string[]) {
  const projects = new Map<string, LockedProject>();
  for (const projectId of [...new Set(projectIds)].sort()) {
    const [project] = await tx.$queryRaw<LockedProject[]>`SELECT id, "ownerId", license, "isPublic" FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
    if (project) projects.set(project.id, project);
  }
  return projects;
}

async function notifyRevisionWatchers(tx: Prisma.TransactionClient, projectId: string, actorId: string, revisionId: string) {
  const watchers = await tx.projectWatch.findMany({ where: { projectId, userId: { not: actorId } }, select: { userId: true } });
  if (watchers.length) {
    await tx.notification.createMany({ data: watchers.map(({ userId }) => ({ recipientId: userId, actorId, type: "REVISION_PUBLISHED", projectId, revisionId })) });
  }
}

function unitChanges(base: RevisionBundle, source: RevisionBundle | null, requested: UnitChangeRequest[]) {
  const targets = new Map(base.files.map((file) => [file.id, file]));
  const sources = new Map(source?.files.map((file) => [file.id, file]) ?? []);
  const changedTargets = new Set<string>();
  const addedSources = new Set<string>();
  const changes: ProposalChangeData[] = [];
  for (const request of requested) {
    if (request.action === "ADD_UNIT") {
      const sourceFile = sources.get(request.sourceFileId);
      if (!sourceFile) return { error: "Selected source unit is no longer available" };
      if (targets.has(sourceFile.id) || addedSources.has(sourceFile.id)) return { error: "This unit already has a change in this proposal" };
      if (!sourceFile.kind) return { error: "Added units need a published kind" };
      addedSources.add(sourceFile.id);
      const targetFileId = crypto.randomUUID();
      changes.push({ type: "ADD_UNIT", action: "ADD_UNIT", target: sourceFile.name, targetFileId, name: sourceFile.name, kind: sourceFile.kind, mimeType: sourceFile.mimeType, size: sourceFile.size, assetKey: sourceFile.assetKey });
      continue;
    }
    const target = targets.get(request.targetFileId);
    if (!target) return { error: "Selected target unit is no longer available" };
    if (changedTargets.has(target.id)) return { error: "This unit already has a change in this proposal" };
    changedTargets.add(target.id);
    if (request.action === "RENAME_UNIT") {
      const newName = normalizeUnitName(request.newName);
      if (!newName) return { error: "A unit name is required and must be 200 characters or fewer" };
      if (newName === target.name) return { error: "This unit name is unchanged" };
      changes.push({ type: "RENAME_UNIT", action: "RENAME_UNIT", target: target.name, targetFileId: target.id, name: target.name, newName, kind: target.kind });
      continue;
    }
    if (request.action === "REMOVE_UNIT") {
      changes.push({ type: "REMOVE_UNIT", action: "REMOVE_UNIT", target: target.name, targetFileId: target.id, name: target.name, kind: target.kind, mimeType: target.mimeType, size: target.size });
      continue;
    }
    const sourceFile = sources.get(request.sourceFileId);
    if (!sourceFile) return { error: "Selected source unit is no longer available" };
    changes.push({ type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: target.name, targetFileId: target.id, name: target.name, kind: target.kind, mimeType: sourceFile.mimeType, size: sourceFile.size, assetKey: sourceFile.assetKey });
  }
  return { changes };
}

export async function findVisibleProposal(id: string, userId?: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id }, include: proposalDetails });
  return proposal && isVisible(proposal, userId) ? proposal : null;
}

export async function listVisibleProjectProposals(projectId: string, userId?: string) {
  const proposals = await prisma.proposal.findMany({ where: { projectId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: proposalDetails });
  return proposals.filter((proposal) => isVisible(proposal, userId));
}

export async function listVisibleProposalSummaries(projectId: string, userId?: string, options: { status?: "open" | "closed"; take?: number; cursor?: string | null } = {}) {
  const where: Prisma.ProposalWhereInput = {
    ...visibleProposalWhere(projectId, userId),
    ...(options.status === "open" ? { status: { in: ["OPEN", "CHANGES_REQUESTED", "APPROVED", "PARTIALLY_ACCEPTED"] } } : options.status === "closed" ? { status: { in: ["ACCEPTED", "CLOSED"] } } : {}),
  };
  const take = options.take ?? 20;
  const proposals = await prisma.proposal.findMany({ where, select: proposalSummary, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], cursor: options.cursor ? { id: options.cursor } : undefined, skip: options.cursor ? 1 : undefined, take: take + 1 });
  const hasMore = proposals.length > take;
  const page = proposals.slice(0, take);
  return { items: page.map(publicProposalSummary), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
}

export async function countVisibleProposals(projectId: string, userId?: string, status?: "open" | "closed") {
  return prisma.proposal.count({ where: { ...visibleProposalWhere(projectId, userId), ...(status === "open" ? { status: { in: ["OPEN", "CHANGES_REQUESTED", "APPROVED", "PARTIALLY_ACCEPTED"] } } : status === "closed" ? { status: { in: ["ACCEPTED", "CLOSED"] } } : {}) } });
}

export async function visibleProposalContributorIds(projectId: string, userId?: string) {
  const proposals = await prisma.proposal.findMany({ where: { ...visibleProposalWhere(projectId, userId), changeSet: { changes: { some: { appliedRevisionId: { not: null } } } } }, select: { authorId: true } });
  return proposals.map((proposal) => proposal.authorId);
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
    baseRevision: { id: proposal.baseRevision.id, number: proposal.baseRevision.number, title: proposal.baseRevision.title, capabilityMode: proposal.baseRevision.capabilityMode, capabilityUnitCount: proposal.baseRevision.capabilityUnitCount, adapterId: proposal.baseRevision.adapterId, adapterVersion: proposal.baseRevision.adapterVersion, adapterConfidence: proposal.baseRevision.adapterConfidence, adapterMaturity: proposal.baseRevision.adapterMaturity, previews: proposal.baseRevision.previews.map(({ key: _key, ...preview }) => ({ ...preview, url: publicAssetUrl(preview.url) })) },
    sourceRevision: { id: proposal.sourceRevision.id, number: proposal.sourceRevision.number, title: proposal.sourceRevision.title, capabilityMode: proposal.sourceRevision.capabilityMode, capabilityUnitCount: proposal.sourceRevision.capabilityUnitCount, adapterId: proposal.sourceRevision.adapterId, adapterVersion: proposal.sourceRevision.adapterVersion, adapterConfidence: proposal.sourceRevision.adapterConfidence, adapterMaturity: proposal.sourceRevision.adapterMaturity, project: { slug: proposal.sourceRevision.project.slug, title: proposal.sourceRevision.project.title }, previews: proposal.sourceRevision.previews.map(({ key: _key, ...preview }) => ({ ...preview, url: publicAssetUrl(preview.url) })) },
    author: proposal.author,
    relatedIssue: proposal.relatedIssue,
    reviewer: proposal.reviewer,
    acceptedBy: proposal.acceptedBy,
    changeSet: proposal.changeSet && { id: proposal.changeSet.id, changes: proposal.changeSet.changes.map((change) => ({
      id: change.id,
      type: change.type,
      action: change.action ?? change.type,
      target: change.target,
      targetFileId: change.targetFileId,
      name: change.name,
      newName: change.newName,
      kind: change.kind,
      mimeType: change.mimeType,
      size: change.size,
      reviewStatus: change.reviewStatus,
      reviewComment: change.reviewComment,
      reviewedAt: change.reviewedAt,
      reviewedBy: change.reviewedBy,
      appliedRevision: change.appliedRevision ?? (change.type === "REPLACE_DOCUMENT" ? proposal.appliedRevisions[0] ?? null : null),
      reviewHistory: change.reviewHistory.map((review) => ({
        id: review.id,
        status: review.status,
        eventType: review.eventType,
        comment: review.comment,
        reason: review.reason,
        createdAt: review.createdAt,
        author: review.author,
        checkedLatestRevisionId: review.checkedLatestRevisionId,
        causedByRevision: review.causedByRevision,
      })),
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
  const status = filter === "open" || filter === "closed" ? filter : undefined;
  const [{ items, nextCursor }, total] = await Promise.all([
    listVisibleProposalSummaries(project.id, session?.user.id, { status, take: limit, cursor }),
    prisma.proposal.count({ where: { ...visibleProposalWhere(project.id, session?.user.id), ...(status === "open" ? { status: { in: ["OPEN", "CHANGES_REQUESTED", "APPROVED", "PARTIALLY_ACCEPTED"] } } : status === "closed" ? { status: { in: ["ACCEPTED", "CLOSED"] } } : {}) } }),
  ]);
  if (!filter && !searchParams.has("cursor") && !searchParams.has("limit")) return NextResponse.json(items);
  return NextResponse.json({ items, nextCursor, total });
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
    prisma.revision.findFirst({ where: { id: input.baseRevisionId, projectId: project.id, isPublished: true }, select: { id: true, sourceKey: true, sourceUrl: true, sourceChecksum: true, tool: true, toolVersion: true, tags: true, capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { position: true, key: true, url: true, mimeType: true, size: true, altText: true } } } }),
    prisma.revision.findUnique({ where: { id: input.sourceRevisionId }, include: { project: { select: { id: true, ownerId: true } }, previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } }),
  ]);
  if (!baseRevision) return error("Base revision not found", 400);
  if (!sourceRevision?.isPublished || sourceRevision.project.ownerId !== session.user.id) return error("Source revision not found", 400);
  if (baseRevision.id === sourceRevision.id) return error("Proposal has no changes");
  const requestedFiles = input.files ?? [];
  const requestedUnitChanges = input.changes ?? [];
  if (requestedFiles.length && requestedUnitChanges.length) return error("Use either legacy file replacements or unit changes, not both");
  const wholeDocument = !requestedFiles.length && !requestedUnitChanges.length;
  const knownSameSource = sameDocumentSource(baseRevision, sourceRevision);
  const compareWholeBundles = wholeDocument && !knownSameSource
    && baseRevision.capabilityMode === "STRUCTURED" && sourceRevision.capabilityMode === "STRUCTURED";
  const requiresBaseBundle = Boolean(requestedFiles.length || requestedUnitChanges.length);
  const requiresSourceBundle = Boolean(requestedFiles.length || requestedUnitChanges.some((change) => change.action === "ADD_UNIT" || change.action === "MODIFY_UNIT"));
  const needsBaseBundle = requiresBaseBundle || compareWholeBundles;
  const needsSourceBundle = requiresSourceBundle || compareWholeBundles;
  const [baseBundle, sourceBundle] = await Promise.all([
    needsBaseBundle ? readRevisionBundle(baseRevision.sourceKey) : Promise.resolve(null),
    needsSourceBundle ? readRevisionBundle(sourceRevision.sourceKey) : Promise.resolve(null),
  ]);
  if ((requiresBaseBundle && !baseBundle) || (requiresSourceBundle && !sourceBundle)) return error("This revision needs a file bundle before individual units can be changed.", 409);
  let changes: ProposalChangeData[];
  if (requestedUnitChanges.length) {
    const prepared = unitChanges(baseBundle!, sourceBundle, requestedUnitChanges as UnitChangeRequest[]);
    if ("error" in prepared) return error(prepared.error ?? "Selected unit is invalid");
    changes = prepared.changes;
    try {
      if (hasNoOpModifyUnit(baseBundle!, sourceBundle, changes)) return error("Proposal has no changes");
      selectiveBundle(baseBundle!, sourceBundle, changes, changes);
    } catch (cause) {
      if (cause instanceof ProposalError) {
        if (cause.details?.missingDependencyIds?.length) return error("Include required dependency units in this proposal.");
        if (cause.message === "Selected changes contain invalid unit dependencies") return error("Selected unit dependencies are invalid.");
        if (cause.message === "At least one unit must remain.") return error("At least one unit must remain.");
        if (cause.message === "A source unit cannot map to multiple target units") return error("A source unit cannot map to multiple target units.");
      }
      throw cause;
    }
  } else if (requestedFiles.length) {
    const targetFiles = new Map(baseBundle!.files.map((file) => [file.id, file]));
    const sourceFiles = new Map(sourceBundle!.files.map((file) => [file.id, file]));
    const targetIds = requestedFiles.map((file) => file.targetFileId);
    if (new Set(targetIds).size !== targetIds.length) return error("This unit already has a change in this proposal");
    changes = requestedFiles.map((file) => {
      const sourceFile = sourceFiles.get(file.sourceFileId);
      const targetFile = targetFiles.get(file.targetFileId);
      if (!sourceFile || !targetFile) return null;
      return { type: "REPLACE_ASSET", action: "REPLACE_ASSET", target: targetFile.name, targetFileId: targetFile.id, name: sourceFile.name, kind: targetFile.kind, mimeType: sourceFile.mimeType, size: sourceFile.size, assetKey: sourceFile.assetKey } as ProposalChangeData;
    }).filter((change): change is ProposalChangeData => Boolean(change));
    if (changes.length !== requestedFiles.length) return error("Selected files no longer match their published revisions", 400);
  } else {
    changes = [{ type: "REPLACE_DOCUMENT", action: "REPLACE_DOCUMENT", target: "whole_document" }];
    if (sameAppliedDocument(baseRevision, sourceRevision, baseBundle, sourceBundle)) return error("Proposal has no changes");
  }
  const relatedIssueId = input.relatedIssueId || undefined;
  if (relatedIssueId) {
    const relatedIssue = await prisma.issue.findFirst({ where: { id: relatedIssueId, projectId: project.id }, select: { id: true } });
    if (!relatedIssue) return error("Related issue not found", 400);
  }
  const result = await prisma.$transaction(async (tx) => {
    const lockedProjects = await lockProjects(tx, [project.id, sourceRevision.project.id]);
    if (!lockedProjects.has(project.id) || !lockedProjects.has(sourceRevision.project.id)) throw new Error("Project not found");
    const [lockedBase, lockedSource] = await Promise.all([
      tx.revision.findFirst({ where: { id: baseRevision.id, projectId: project.id, isPublished: true }, select: { id: true } }),
      tx.revision.findFirst({ where: { id: sourceRevision.id, projectId: sourceRevision.project.id, isPublished: true }, select: { id: true } }),
    ]);
    if (!lockedBase || !lockedSource) throw new Error("Revision not found");
    if (input.requestId) {
      const existing = await tx.proposal.findFirst({ where: { projectId: project.id, authorId: session.user.id, requestId: input.requestId }, include: proposalDetails });
      if (existing) return { proposal: existing, created: false };
    }
    const latestProposal = await tx.proposal.findFirst({ where: { projectId: project.id }, orderBy: { proposalNumber: "desc" }, select: { proposalNumber: true } });
    const proposal = await tx.proposal.create({
      data: {
        projectId: project.id,
        proposalNumber: (latestProposal?.proposalNumber ?? 0) + 1,
        baseRevisionId: baseRevision.id,
        sourceRevisionId: sourceRevision.id,
        authorId: session.user.id,
        relatedIssueId,
        requestId: input.requestId,
        title: input.title,
        body: input.body,
        changeSet: { create: { changes: { create: changes } } },
      },
      include: proposalDetails,
    });
    return { proposal, created: true };
  });
  return NextResponse.json(publicProposal(result.proposal), { status: result.created ? 201 : 200 });
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
      const latest = await tx.revision.findFirst({ where: { projectId: proposal.projectId, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, sourceKey: true } });
      if (!latest) throw new ProposalError("Current revision not found", 409);
      if (parsed.data.status === "APPROVED" && (change.action ?? change.type) !== "REPLACE_DOCUMENT" && latest.id !== proposal.baseRevision.id) {
        const [baseBundle, latestBundle] = await Promise.all([readRevisionBundle(proposal.baseRevision.sourceKey), readRevisionBundle(latest.sourceKey)]);
        const conflict = conflictForChange(change, baseBundle, latestBundle);
        if (!conflict || conflict.status !== "NO_CONFLICT") throw new ProposalError("Review conflicts before approving this change", 409);
      }
      const reviewedAt = new Date();
      const reviewed = await tx.change.update({ where: { id: change.id }, data: { reviewStatus: parsed.data.status, reviewComment: parsed.data.comment || null, reviewedById: session.user.id, reviewedAt } });
      await tx.changeReview.create({ data: { changeId: change.id, authorId: session.user.id, status: parsed.data.status, eventType: "REVIEW", comment: parsed.data.comment || null, checkedLatestRevisionId: latest.id, createdAt: reviewedAt } });
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

type ProposalFailureDetails = { latestRevision?: { id: string; number: number }; conflictChangeIds?: string[]; requiredChangeIds?: string[]; missingDependencyIds?: string[] };
class ProposalError extends Error {
  constructor(message: string, readonly status: number, readonly details?: ProposalFailureDetails) { super(message); }
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

type SelectedUnitChange = {
  id?: string;
  type: string;
  action?: string | null;
  targetFileId?: string | null;
  assetKey?: string | null;
  mimeType?: string | null;
  size?: number | null;
  name?: string | null;
  newName?: string | null;
  kind?: string | null;
  appliedRevisionId?: string | null;
};

function selectiveBundle(latest: RevisionBundle, source: RevisionBundle | null, changes: SelectedUnitChange[], allChanges: SelectedUnitChange[]) {
  const { sourceFiles, sourceToTargetId } = sourceMappings(source, allChanges);
  const dependenciesFor = (file: RevisionBundleFile) => file.dependencies!.map((id) => sourceToTargetId.get(id) ?? id);
  const files = [...latest.files];
  const changedIds = new Set<string>();
  for (const change of changes) {
    const action = change.action ?? change.type;
    const targetFileId = change.targetFileId;
    if (!targetFileId || changedIds.has(targetFileId)) throw new ProposalError("A selected unit is invalid", 409);
    changedIds.add(targetFileId);
    const index = files.findIndex((file) => file.id === targetFileId);
    if (action === "ADD_UNIT") {
      if (index >= 0 || !change.assetKey) throw new ProposalError("A selected unit is no longer available", 409);
      const sourceFile = sourceFiles.get(change.assetKey);
      if (!sourceFile) throw new ProposalError("A selected source unit is no longer available", 409);
      files.push({ ...sourceFile, id: targetFileId, name: change.name ?? sourceFile.name, kind: change.kind ?? sourceFile.kind, ...(source?.version === 3 ? { dependencies: dependenciesFor(sourceFile) } : {}) });
      continue;
    }
    if (index < 0) throw new ProposalError("A selected target file is no longer available", 409);
    const current = files[index];
    if (action === "REMOVE_UNIT") {
      files.splice(index, 1);
      continue;
    }
    if (action === "RENAME_UNIT") {
      const newName = change.newName && normalizeUnitName(change.newName);
      if (!newName || newName === current.name) throw new ProposalError("A selected unit name is invalid", 409);
      files[index] = { ...current, name: newName };
      continue;
    }
    if (action !== "MODIFY_UNIT" && action !== "REPLACE_ASSET") throw new ProposalError("Selected changes are not supported", 409);
    if (!change.assetKey || !change.mimeType || change.size == null) throw new ProposalError("Selected changes are not file replacements", 409);
    const sourceFile = sourceFiles.get(change.assetKey);
    if (!sourceFile) throw new ProposalError("A selected source unit is no longer available", 409);
    files[index] = { ...current, mimeType: change.mimeType, size: change.size, assetKey: change.assetKey, previewKeys: sourceFile.previewKeys, checksum: sourceFile.checksum, ...(action === "MODIFY_UNIT" && source?.version === 3 ? { dependencies: dependenciesFor(sourceFile) } : {}) };
  }
  if (!files.length) throw new ProposalError("At least one unit must remain.", 409);
  const version = latest.version === 3 || (source?.version === 3 && changes.some((change) => ["ADD_UNIT", "MODIFY_UNIT"].includes(change.action ?? change.type))) ? 3 : 2;
  const result: RevisionBundle = { version, files: version === 3 ? files.map((file) => ({ ...file, dependencies: file.dependencies ?? [] })) : files };
  if (version === 3) {
    const ids = new Set(result.files.map((file) => file.id));
    const malformed = result.files.some((file) => !file.dependencies || file.dependencies.some((id) => !id || id === file.id) || new Set(file.dependencies).size !== file.dependencies.length);
    if (malformed) throw new ProposalError("Selected changes contain invalid unit dependencies", 409);
    const missingDependencyIds = [...new Set(result.files.flatMap((file) => file.dependencies!).filter((id) => !ids.has(id)))].sort();
    if (missingDependencyIds.length) {
      const selectedIds = new Set(changes.map((change) => change.id).filter(Boolean));
      const requiredChangeIds = allChanges.filter((change) => change.id && !selectedIds.has(change.id) && !change.appliedRevisionId && (change.action ?? change.type) === "ADD_UNIT" && missingDependencyIds.includes(change.targetFileId ?? "")).map((change) => change.id!);
      throw new ProposalError(requiredChangeIds.length ? "Selected changes require additional dependency changes" : "Selected changes would leave unresolved unit dependencies", 409, { ...(requiredChangeIds.length ? { requiredChangeIds } : {}), missingDependencyIds });
    }
  }
  return result;
}

async function invalidateUpstreamApprovals(tx: Prisma.TransactionClient, projectId: string, proposalId: string, before: RevisionBundle, after: RevisionBundle, targetFileIds: string[] | null, revision: { id: string; number: number }) {
  const changedIds = changedUnitIds(before, after, targetFileIds);
  if (!changedIds.length) return;
  const affected = await tx.change.findMany({
    where: {
      targetFileId: { in: changedIds }, reviewStatus: "APPROVED", appliedRevisionId: null,
      changeSet: { proposal: { projectId, id: { not: proposalId }, status: { notIn: ["CLOSED", "ACCEPTED"] } } },
    },
    select: { id: true, changeSetId: true },
  });
  if (!affected.length) return;
  const affectedIds = affected.map((change) => change.id);
  await tx.change.updateMany({ where: { id: { in: affectedIds } }, data: { reviewStatus: "PENDING", reviewComment: null, reviewedById: null, reviewedAt: null } });
  await tx.changeReview.createMany({
    data: affectedIds.map((changeId) => ({ changeId, authorId: null, status: "PENDING", eventType: "INVALIDATED_UPSTREAM", reason: `Changed upstream in Revision ${revision.number}`, causedByRevisionId: revision.id })),
    skipDuplicates: true,
  });
  const changeSets = await tx.changeSet.findMany({ where: { id: { in: [...new Set(affected.map((change) => change.changeSetId))] } }, select: { proposalId: true, changes: { select: { reviewStatus: true, appliedRevisionId: true } } } });
  await Promise.all(changeSets.map((changeSet) => tx.proposal.update({ where: { id: changeSet.proposalId }, data: { status: proposalStatusForChanges(changeSet.changes.map((change) => change.reviewStatus), changeSet.changes.filter((change) => change.appliedRevisionId).length) } })));
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
          baseRevision: { select: { id: true, projectId: true, isPublished: true, sourceKey: true } },
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
      const latest = await tx.revision.findFirst({ where: { projectId: initial.projectId, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, sourceKey: true } });
      if (!latest) throw new ProposalError("Current revision not found", 409);
      if (latest.id !== proposal.baseRevisionId && (parsed.data.reviewedLatestRevisionId !== latest.id || !sameIds(parsed.data.reviewedChangeIds ?? [], requestedIds))) throw new ProposalError("Review the latest revision before applying these selected changes", 409, { latestRevision: latest });
      const source = proposal.sourceRevision;
      if (legacyChange) {
        const [beforeBundle, afterBundle] = await Promise.all([readRevisionBundle(latest.sourceKey), readRevisionBundle(source.sourceKey)]);
        const stagedRevision = await tx.revision.create({
          data: {
            projectId: initial.projectId,
            publishedById: session.user.id,
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
            capabilityMode: source.capabilityMode,
            capabilityUnitCount: source.capabilityUnitCount,
            adapterId: source.adapterId,
            adapterVersion: source.adapterVersion,
            adapterConfidence: source.adapterConfidence,
            adapterMaturity: source.adapterMaturity,
            sourceProposalId: proposal.id,
            isPublished: false,
            previews: { create: source.previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
          },
        });
        const revision = await tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, select: { id: true, number: true, title: true } });
        await tx.change.update({ where: { id: selected[0].id }, data: { appliedRevisionId: revision.id } });
        if (beforeBundle && afterBundle) await invalidateUpstreamApprovals(tx, initial.projectId, proposal.id, beforeBundle, afterBundle, null, revision);
        await tx.proposal.update({ where: { id: proposal.id }, data: { status: "ACCEPTED", acceptedById: session.user.id } });
        if (lockedProject.isPublic) await notifyRevisionWatchers(tx, initial.projectId, session.user.id, revision.id);
        return { revision, alreadyApplied: false };
      }
      const latestWithSource = await tx.revision.findUnique({ where: { id: latest.id }, include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } });
      if (!latestWithSource) throw new ProposalError("Current revision not found", 409);
      const needsSourceBundle = selected.some((change) => {
        const action = change.action ?? change.type;
        return action === "ADD_UNIT" || action === "MODIFY_UNIT" || action === "REPLACE_ASSET";
      });
      const [latestBundle, sourceBundle] = await Promise.all([
        readRevisionBundle(latestWithSource.sourceKey),
        needsSourceBundle ? readRevisionBundle(source.sourceKey) : Promise.resolve(null),
      ]);
      const baseBundle = latest.id !== proposal.baseRevisionId ? await readRevisionBundle(proposal.baseRevision.sourceKey) : latestBundle;
      if (!latestBundle || (needsSourceBundle && !sourceBundle) || (latest.id !== proposal.baseRevisionId && !baseBundle)) throw new ProposalError("This revision needs a file bundle before individual files can be replaced.", 409);
      if (latest.id !== proposal.baseRevisionId) {
        const conflicts = selected.map((change) => ({ id: change.id, result: conflictForChange(change, baseBundle, latestBundle) })).filter((item) => item.result?.status !== "NO_CONFLICT");
        if (conflicts.length) throw new ProposalError("One or more selected changes need conflict review", 409, { latestRevision: latest, conflictChangeIds: conflicts.map((item) => item.id) });
      }
      const bundle = selectiveBundle(latestBundle, sourceBundle, selected, proposal.changeSet.changes);
      const adapterRevision = needsSourceBundle && source.adapterId ? source : latestWithSource;
      const previewByKey = new Map([...latestWithSource.previews, ...source.previews].map((preview) => [preview.key, preview]));
      const previewKeys = [...new Set(bundle.files.flatMap((file) => file.previewKeys))];
      const previews = previewKeys.map((key) => previewByKey.get(key)).filter((preview): preview is NonNullable<typeof preview> => Boolean(preview)).map((preview, position) => ({ ...preview, position }));
      if (!previews.length || previews.length !== previewKeys.length) throw new ProposalError("Selected files are missing preview mappings", 409);
      uploadedBundleKey = `revisions/${initial.projectId}/${crypto.randomUUID()}/bundle.json`;
      const { checksum } = await putRevisionBundle(uploadedBundleKey, bundle);
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: initial.projectId,
          publishedById: session.user.id,
          number: latest.number + 1,
          parentId: latest.id,
          title: `Accepted: ${proposal.title}`.slice(0, 120),
          changeDescription: `Applied ${selected.length} ${selected.length === 1 ? "change" : "changes"} from Proposal #${proposal.proposalNumber}`,
          license: lockedProject.license,
          sourceKey: uploadedBundleKey,
          sourceUrl: null,
          tool: latestWithSource.tool,
          toolVersion: latestWithSource.toolVersion,
          tags: latestWithSource.tags,
          sourceChecksum: checksum,
          capabilityMode: "STRUCTURED",
          capabilityUnitCount: bundle.files.length,
          adapterId: adapterRevision.adapterId,
          adapterVersion: adapterRevision.adapterVersion,
          adapterConfidence: adapterRevision.adapterConfidence,
          adapterMaturity: adapterRevision.adapterMaturity,
          sourceProposalId: proposal.id,
          isPublished: false,
          previews: { create: previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
        },
      });
      const revision = await tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, select: { id: true, number: true, title: true } });
      await tx.change.updateMany({ where: { id: { in: requestedIds } }, data: { appliedRevisionId: revision.id } });
      // E3 R1: unapplied changes keep their review state and review metadata.
      // Only genuinely affected changes are invalidated through the existing
      // domain invalidation below; the backend stays authoritative (no frontend overwrite).
      await invalidateUpstreamApprovals(tx, initial.projectId, proposal.id, latestBundle, bundle, selected.map((change) => change.targetFileId).filter((id): id is string => Boolean(id)), revision);
      const appliedCount = proposal.changeSet.changes.filter((change) => change.appliedRevisionId).length + selected.length;
      await tx.proposal.update({ where: { id: proposal.id }, data: { status: proposalStatusForChanges(proposal.changeSet.changes.map((change) => change.reviewStatus), appliedCount), acceptedById: session.user.id } });
      if (lockedProject.isPublic) await notifyRevisionWatchers(tx, initial.projectId, session.user.id, revision.id);
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
