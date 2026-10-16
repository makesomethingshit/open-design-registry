import type { Prisma } from "@prisma/client";

type Publication =
  | { type: "REVISION_PUBLISHED"; revisionId: string }
  | { type: "RELEASE_PUBLISHED"; releaseId: string };

export async function notifyProjectWatchers(tx: Prisma.TransactionClient, projectId: string, actorId: string, publication: Publication) {
  const watchers = await tx.projectWatch.findMany({ where: { projectId, userId: { not: actorId } }, select: { userId: true } });
  if (watchers.length) {
    await tx.notification.createMany({ data: watchers.map(({ userId }) => ({ recipientId: userId, actorId, projectId, ...publication })) });
  }
}
