import type { Prisma } from "@prisma/client";

export function visibleNotificationWhere(recipientId: string): Prisma.NotificationWhereInput {
  return { recipientId, OR: [
    { type: { notIn: ["REVISION_PUBLISHED", "RELEASE_PUBLISHED"] } },
    { project: { isPublic: true } },
  ] };
}
