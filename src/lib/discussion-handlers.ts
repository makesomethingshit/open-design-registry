import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { discussionCommentSchema, discussionSchema } from "./discussion-validation";
import { lockPublicProject, PrivateProjectWrite } from "./project-visibility-lock";

type ProjectScope = { slug: string };
type DiscussionScope = ProjectScope & { id: string };

const notFound = () => NextResponse.json({ error: "Project or discussion not found" }, { status: 404 });

export async function getProjectDiscussions(request: Request, { slug }: ProjectScope) {
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project) return notFound();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!project.isPublic && session?.user.id !== project.ownerId) return notFound();

  const discussions = await prisma.discussion.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true, author: { select: { name: true } }, _count: { select: { comments: true } } },
  });
  return NextResponse.json(discussions);
}

export async function postProjectDiscussion(request: Request, { slug }: ProjectScope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project?.isPublic) return notFound();
  const parsed = discussionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Title and body are invalid" }, { status: 400 });

  let discussion;
  try {
    discussion = await prisma.$transaction(async (tx) => {
    const currentProject = await lockPublicProject(tx, project.id);
    const created = await tx.discussion.create({
      data: { projectId: project.id, authorId: session.user.id, ...parsed.data },
      include: { author: { select: { name: true } } },
    });
    if (currentProject.ownerId !== session.user.id) {
      await tx.notification.create({
        data: { recipientId: currentProject.ownerId, actorId: session.user.id, type: "DISCUSSION_CREATED", projectId: project.id, discussionId: created.id },
      });
    }
    return created;
    });
  } catch (cause) {
    if (cause instanceof PrivateProjectWrite) return notFound();
    throw cause;
  }

  return NextResponse.json(discussion, { status: 201 });
}

export async function getProjectDiscussion(request: Request, { slug, id }: DiscussionScope) {
  const discussion = await prisma.discussion.findFirst({
    where: { id, project: { slug } },
    select: {
      id: true, title: true, body: true, createdAt: true,
      author: { select: { name: true } },
      project: { select: { slug: true, title: true, ownerId: true, isPublic: true } },
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, author: { select: { name: true } } } },
    },
  });
  if (!discussion) return notFound();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!discussion.project.isPublic && session?.user.id !== discussion.project.ownerId) return notFound();

  const { ownerId: _ownerId, isPublic: _isPublic, ...project } = discussion.project;
  return NextResponse.json({ ...discussion, project });
}

export async function postProjectDiscussionComment(request: Request, { slug, id }: DiscussionScope) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });

  const discussion = await prisma.discussion.findFirst({ where: { id, project: { slug, isPublic: true } }, select: { id: true, projectId: true } });
  if (!discussion) return notFound();
  const parsed = discussionCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Comment body is invalid" }, { status: 400 });

  try {
    const comment = await prisma.$transaction(async (tx) => {
      await lockPublicProject(tx, discussion.projectId);
      return tx.discussionComment.create({
        data: { discussionId: discussion.id, authorId: session.user.id, body: parsed.data.body },
        include: { author: { select: { name: true } } },
      });
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (cause) {
    if (cause instanceof PrivateProjectWrite) return notFound();
    throw cause;
  }
}
