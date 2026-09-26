import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { releaseCreateSchema } from "@/src/lib/release-validation";

type ProjectScope = { slug: string };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function createProjectRelease(request: Request, { slug }: ProjectScope) {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project) return error("Project not found", 404);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  if (project.ownerId !== session.user.id) return error("Only the project owner can publish releases", project.isPublic ? 403 : 404);

  const parsed = releaseCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Release details are invalid", 400);

  const revisions = await prisma.revision.findMany({
    where: { id: { in: parsed.data.revisionIds } },
    select: { id: true, projectId: true, number: true, isPublished: true },
  });
  if (revisions.length !== parsed.data.revisionIds.length || revisions.some((revision) => revision.projectId !== project.id || !revision.isPublished)) {
    return error("Select only published revisions from this project", 400);
  }

  revisions.sort((left, right) => left.number - right.number);

  try {
    const release = await prisma.$transaction(async (tx) => {
      const [lockedProject] = await tx.$queryRaw<Array<{ id: string; isPublic: boolean }>>`SELECT id, "isPublic" FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
      if (!lockedProject) return null;
      const latest = await tx.release.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" }, select: { number: true } });
      const created = await tx.release.create({
        data: {
          projectId: project.id,
          number: (latest?.number ?? 0) + 1,
          title: parsed.data.title,
          description: parsed.data.description,
          publishedById: session.user.id,
          revisions: { create: revisions.map((revision, position) => ({ position, revision: { connect: { id: revision.id } } })) },
        },
        select: { id: true, number: true },
      });
      if (lockedProject.isPublic) {
        const watchers = await tx.projectWatch.findMany({ where: { projectId: project.id, userId: { not: session.user.id } }, select: { userId: true } });
        if (watchers.length) {
          await tx.notification.createMany({ data: watchers.map((watcher) => ({ recipientId: watcher.userId, actorId: session.user.id, type: "RELEASE_PUBLISHED", projectId: project.id, releaseId: created.id })) });
        }
      }
      return created;
    });
    if (!release) return error("Project not found", 404);
    return NextResponse.json(release, { status: 201 });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const target = cause.meta?.target;
      if ((Array.isArray(target) && target.includes("projectId") && target.includes("number")) || target === "Release_projectId_number_key") {
        return error("A release was published at the same time. Review your selection and try again.", 409);
      }
    }
    console.error("release publish failed", cause);
    return error("Release could not be published", 500);
  }
}
