import type { Prisma } from "@prisma/client";

export function visibleNotificationWhere(recipientId: string): Prisma.NotificationWhereInput {
  const proposalTypes = ["PROPOSAL_CREATED", "PROPOSAL_CHANGES_REQUESTED", "PROPOSAL_APPROVED", "PROPOSAL_APPLIED"] as const;
  const readableProject = { OR: [{ isPublic: true }, { ownerId: recipientId }] };
  return { recipientId, OR: [
    { type: { notIn: ["REVISION_PUBLISHED", "RELEASE_PUBLISHED", ...proposalTypes] } },
    { type: { in: ["REVISION_PUBLISHED", "RELEASE_PUBLISHED"] }, project: { isPublic: true } },
    { type: { in: [...proposalTypes] }, proposal: {
      project: readableProject,
      baseRevision: { isPublished: true },
      sourceRevision: { isPublished: true, project: readableProject },
    } },
  ] };
}
