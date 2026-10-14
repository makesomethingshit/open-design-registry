import type { Prisma } from "@prisma/client";

/** Visibility changes update the same Project row before committing isPublic. */
export class PrivateProjectWrite extends Error {
  constructor() { super("Project is no longer public"); }
}

/** Call before creating content; use the same lock ordering as visibility PATCH. */
export async function lockPublicProject(tx: Prisma.TransactionClient, projectId: string) {
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR SHARE`;
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project?.isPublic) throw new PrivateProjectWrite();
  return project;
}
