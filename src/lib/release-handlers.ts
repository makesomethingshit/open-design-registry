import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { releaseCreateSchema } from "@/src/lib/release-validation";
import { notifyProjectWatchers } from "@/src/lib/project-watch-notifications";
import { maxSmallJsonBytes, readBoundedJson } from "@/src/lib/request-body";

type ProjectScope = { slug: string };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isSameReleasePayload(existing: { title: string; description: string; revisions: Array<{ revisionId: string }> }, title: string, description: string, revisionIds: string[]) {
  return existing.title === title
    && existing.description === description
    && existing.revisions.length === revisionIds.length
    && existing.revisions.every((revision, index) => revision.revisionId === revisionIds[index]);
}

function uniqueTarget(target: unknown, fields: string[]) {
  return fields.every((field) => Array.isArray(target) ? target.includes(field) : typeof target === "string" && target.includes(field));
}

export async function createProjectRelease(request: Request, { slug }: ProjectScope) {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project) return error("Project not found", 404);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  if (project.ownerId !== session.user.id) return error("Only the project owner can publish releases", project.isPublic ? 403 : 404);

  const body = await readBoundedJson(request, maxSmallJsonBytes);
  if (body.tooLarge) return error("Request body is too large", 413);
  const parsed = releaseCreateSchema.safeParse(body.value);
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
    const result = await prisma.$transaction(async (tx) => {
      const [lockedProject] = await tx.$queryRaw<Array<{ id: string; isPublic: boolean }>>`SELECT id, "isPublic" FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
      if (!lockedProject) return null;
      if (parsed.data.requestId) {
        const existing = await tx.release.findUnique({
          where: { projectId_publishedById_requestId: { projectId: project.id, publishedById: session.user.id, requestId: parsed.data.requestId } },
          select: { id: true, number: true, title: true, description: true, revisions: { orderBy: { position: "asc" }, select: { revisionId: true } } },
        });
        if (existing) {
          const samePayload = isSameReleasePayload(existing, parsed.data.title, parsed.data.description, revisions.map((revision) => revision.id));
          return { release: { id: existing.id, number: existing.number }, created: false, conflict: !samePayload };
        }
      }
      const latest = await tx.release.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" }, select: { number: true } });
      const created = await tx.release.create({
        data: {
          projectId: project.id,
          number: (latest?.number ?? 0) + 1,
          title: parsed.data.title,
          description: parsed.data.description,
          publishedById: session.user.id,
          ...(parsed.data.requestId ? { requestId: parsed.data.requestId } : {}),
          revisions: { create: revisions.map((revision, position) => ({ position, revision: { connect: { id: revision.id } } })) },
        },
        select: { id: true, number: true },
      });
      if (lockedProject.isPublic) await notifyProjectWatchers(tx, project.id, session.user.id, { type: "RELEASE_PUBLISHED", releaseId: created.id });
      return { release: created, created: true, conflict: false };
    });
    if (!result) return error("Project not found", 404);
    if (result.conflict) return error("This request ID was already used for a different release", 409);
    return NextResponse.json(result.release, { status: result.created ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      const target = cause.meta?.target;
      if (parsed.data.requestId && uniqueTarget(target, ["projectId", "publishedById", "requestId"])) {
        const existing = await prisma.release.findUnique({
          where: { projectId_publishedById_requestId: { projectId: project.id, publishedById: session.user.id, requestId: parsed.data.requestId } },
          select: { id: true, number: true, title: true, description: true, revisions: { orderBy: { position: "asc" }, select: { revisionId: true } } },
        });
        if (existing && isSameReleasePayload(existing, parsed.data.title, parsed.data.description, revisions.map((revision) => revision.id))) {
          return NextResponse.json({ id: existing.id, number: existing.number }, { status: 200 });
        }
        if (existing) return error("This request ID was already used for a different release", 409);
      }
      if (uniqueTarget(target, ["projectId", "number"]) || target === "Release_projectId_number_key") {
        return error("A release was published at the same time. Review your selection and try again.", 409);
      }
    }
    console.error("release publish failed", cause);
    return error("Release could not be published", 500);
  }
}
