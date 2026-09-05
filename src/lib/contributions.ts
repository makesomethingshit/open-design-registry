import { Prisma, type Contribution, type ContributionEventType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { toPublicRevision } from "./revisions";

export type Actor = { id: string; name: string };
export class ContributionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const id = z.string().trim().min(1).max(200);
const createSchema = z.object({
  title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000),
  baseRevisionId: id, proposedRevisionId: id, rightsConfirmed: z.literal(true),
}).strict();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("comment"), body: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ action: z.literal("update"), expectedVersion: z.number().int().positive(), proposedRevisionId: id, baseRevisionId: id, rightsConfirmed: z.literal(true), body: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ action: z.enum(["request_changes", "reject"]), expectedVersion: z.number().int().positive(), body: z.string().trim().min(1).max(10000) }).strict(),
  z.object({ action: z.literal("accept"), expectedVersion: z.number().int().positive(), rightsConfirmed: z.literal(true), body: z.string().trim().max(10000).default("") }).strict(),
]);
const revisionInclude = { previews: { orderBy: [{ position: "asc" as const }, { key: "asc" as const }] } };
const notFound = () => new ContributionError("Contribution or project not found", 404);

export async function visibleProject(slug: string, userId?: string, db: Prisma.TransactionClient = prisma) {
  const project = await db.project.findUnique({ where: { slug } });
  if (!project || (!project.isPublic && project.ownerId !== userId)) throw notFound();
  return project;
}
export async function listContributions(slug: string, userId?: string, cursor?: string) {
  const project = await visibleProject(slug, userId);
  const items = await prisma.contribution.findMany({
    where: { projectId: project.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, title: true, authorName: true, status: true, createdAt: true, acceptedRevision: { select: { number: true } } },
  });
  return { project, items: items.slice(0, 20), nextCursor: items.length > 20 ? items[19].id : null };
}
export async function getContribution(slug: string, contributionId: string, userId?: string, before?: string) {
  const project = await visibleProject(slug, userId);
  const contribution = await prisma.contribution.findFirst({
    where: { id: contributionId, projectId: project.id },
    include: { baseRevision: { include: revisionInclude }, proposedRevision: { include: revisionInclude }, acceptedRevision: { select: { id: true, number: true, contributorName: true, acceptedByName: true } } },
  });
  if (!contribution) throw notFound();
  const [events, latest] = await Promise.all([
    prisma.contributionEvent.findMany({ where: { contributionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: { baseRevision: { select: { number: true } }, proposedRevision: { select: { number: true } } },
    }),
    prisma.revision.findFirst({ where: { projectId: project.id, isPublished: true }, orderBy: { number: "desc" }, include: revisionInclude }),
  ]);
  return { project, contribution: { ...contribution, baseRevision: toPublicRevision(contribution.baseRevision), proposedRevision: toPublicRevision(contribution.proposedRevision) },
    events: events.slice(0, 30).reverse(), nextCursor: events.length > 30 ? events[29].id : null,
    latest: latest ? toPublicRevision(latest) : null,
  };
}
async function proposedRevision(db: Prisma.TransactionClient, revisionId: string, projectId: string, actorId: string, sourceProjectId?: string) {
  const revision = await db.revision.findUnique({ where: { id: revisionId }, include: { project: true, ...revisionInclude } });
  if (!revision?.isPublished || !revision.project.isPublic || revision.project.ownerId !== actorId || revision.project.forkedFromProjectId !== projectId || (sourceProjectId && revision.projectId !== sourceProjectId)) {
    throw new ContributionError("Choose a published revision from your public fork of this project", 400);
  }
  if (!revision.license) throw new ContributionError("Publish a new revision with a recorded license before proposing it", 400);
  return revision;
}
async function latestBase(db: Prisma.TransactionClient, projectId: string, baseRevisionId: string) {
  const latest = await db.revision.findFirst({ where: { projectId, isPublished: true }, orderBy: { number: "desc" } });
  if (!latest || latest.id !== baseRevisionId) throw new ContributionError("The project has changed. Compare against its latest revision and resubmit before accepting.", 409);
  return latest;
}
async function recordEvent(db: Prisma.TransactionClient, contribution: Contribution, actor: Actor, type: ContributionEventType, body: string, ownerId: string) {
  await db.contributionEvent.create({ data: {
    contributionId: contribution.id, actorId: actor.id, actorName: actor.name, type, body,
    version: contribution.version, baseRevisionId: contribution.baseRevisionId, proposedRevisionId: contribution.proposedRevisionId,
  } });
  const recipientId = actor.id === ownerId ? contribution.authorId : ownerId;
  if (recipientId !== actor.id) await db.notification.create({ data: {
    type: "CONTRIBUTION_ACTIVITY", recipientId, actorId: actor.id, projectId: contribution.projectId, contributionId: contribution.id,
  } });
}
export async function createContribution(slug: string, actor: Actor, input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new ContributionError("Provide a title, explanation, revisions and publication rights confirmation", 400);
  return prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "Project" WHERE slug = ${slug} FOR UPDATE`;
    const project = await visibleProject(slug, actor.id, db);
    if (!project.isPublic) throw new ContributionError("Contribution proposals require a public project", 403);
    await latestBase(db, project.id, parsed.data.baseRevisionId);
    const revision = await proposedRevision(db, parsed.data.proposedRevisionId, project.id, actor.id);
    const contribution = await db.contribution.create({ data: {
      projectId: project.id, sourceProjectId: revision.projectId, sourceProjectTitle: revision.project.title, sourceProjectSlug: revision.project.slug,
      authorId: actor.id, authorName: actor.name, title: parsed.data.title, body: parsed.data.body,
      baseRevisionId: parsed.data.baseRevisionId, proposedRevisionId: revision.id,
    } });
    await recordEvent(db, contribution, actor, "OPENED", parsed.data.body, project.ownerId);
    return contribution;
  });
}
export async function actOnContribution(slug: string, contributionId: string, actor: Actor, input: unknown) {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) throw new ContributionError("Check the action, explanation, version and required confirmations", 400);
  const action = parsed.data;
  return prisma.$transaction(async (db) => {
    // All writers lock the target first, matching the existing publication/restore path.
    await db.$queryRaw`SELECT id FROM "Project" WHERE slug = ${slug} FOR UPDATE`;
    const project = await visibleProject(slug, actor.id, db);
    const current = await db.contribution.findFirst({ where: { id: contributionId, projectId: project.id } });
    if (!current) throw notFound();
    if (action.action === "comment") {
      await recordEvent(db, current, actor, "COMMENTED", action.body, project.ownerId);
      return current;
    }
    if (action.action === "update" ? actor.id !== current.authorId : actor.id !== project.ownerId) throw new ContributionError("You do not have permission for this action", 403);
    // Replaying a completed acceptance is safe and returns the same revision.
    if (action.action === "accept" && current.status === "ACCEPTED") return db.contribution.findUniqueOrThrow({ where: { id: current.id }, include: { acceptedRevision: { select: { id: true, number: true } } } });
    if (current.status === "ACCEPTED" || current.status === "REJECTED") throw new ContributionError("This proposal is closed", 409);
    if (action.expectedVersion !== current.version) throw new ContributionError("The proposal changed. Reload and review the latest version.", 409);
    let next: Contribution;
    let eventType: ContributionEventType;
    if (action.action === "update") {
      if (!project.isPublic) throw new ContributionError("Resubmission requires a public project", 403);
      await latestBase(db, project.id, action.baseRevisionId);
      await proposedRevision(db, action.proposedRevisionId, project.id, actor.id, current.sourceProjectId);
      next = await db.contribution.update({ where: { id: current.id }, data: { proposedRevisionId: action.proposedRevisionId, baseRevisionId: action.baseRevisionId, status: "OPEN", version: { increment: 1 } } });
      eventType = "UPDATED";
    } else if (action.action === "accept") {
      if (current.status !== "OPEN") throw new ContributionError("Wait for the author to resubmit the requested changes", 409);
      const latest = await latestBase(db, project.id, current.baseRevisionId);
      const source = await db.revision.findUniqueOrThrow({ where: { id: current.proposedRevisionId }, include: revisionInclude });
      if (!source.license || source.license !== project.license) throw new ContributionError("The proposed and project licenses must match before acceptance", 409);
      const staged = await db.revision.create({ data: {
        projectId: project.id, number: latest.number + 1, parentId: latest.id,
        title: current.title.slice(0, 120), changeDescription: `Accepted contribution: ${current.title}`.slice(0, 500),
        license: source.license, sourceKey: source.sourceKey, sourceUrl: source.sourceUrl, tool: source.tool,
        toolVersion: source.toolVersion, tags: source.tags, sourceChecksum: source.sourceChecksum,
        acceptedContributionId: current.id, contributorId: current.authorId, contributorName: current.authorName,
        acceptedById: actor.id, acceptedByName: actor.name, isPublished: false,
        previews: { create: source.previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
      } });
      await db.revision.update({ where: { id: staged.id }, data: { isPublished: true } });
      await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
      next = await db.contribution.update({ where: { id: current.id }, data: { status: "ACCEPTED", version: { increment: 1 } } });
      eventType = "ACCEPTED";
    } else {
      eventType = action.action === "request_changes" ? "CHANGES_REQUESTED" : "REJECTED";
      next = await db.contribution.update({ where: { id: current.id }, data: { status: eventType, version: { increment: 1 } } });
    }
    await recordEvent(db, next, actor, eventType, action.body, project.ownerId);
    return db.contribution.findUniqueOrThrow({ where: { id: next.id }, include: { acceptedRevision: { select: { id: true, number: true } } } });
  });
}
