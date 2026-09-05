import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { slugify } from "@/src/lib/project-validation";
import { publicAssetUrl } from "@/src/lib/storage";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  const { slug: sourceSlug, number } = await params;
  const body = await request.json().catch(() => null) as { title?: unknown; rightsConfirmed?: unknown } | null;
  if (body?.rightsConfirmed !== true) return NextResponse.json({ error: "Confirm your rights to publish this fork" }, { status: 400 });
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  const requestedTitle = typeof body?.title === "string" ? body.title.trim() : "";
  if (requestedTitle.length > 120) return NextResponse.json({ error: "Title must be 120 characters or fewer" }, { status: 400 });

  try {
    const fork = await prisma.$transaction(async (tx) => {
      // Serialize visibility/license changes with reading the source and publishing the fork.
      await tx.$queryRaw`SELECT id FROM "Project" WHERE slug = ${sourceSlug} FOR SHARE`;
      const source = await tx.project.findUnique({
        where: { slug: sourceSlug },
        include: { revisions: { where: { number: revisionNumber, isPublished: true }, include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } } },
      });
      const revision = source?.revisions[0];
      if (!source?.isPublic || !revision) throw new ForkError("Public revision not found", 404);
      const title = requestedTitle || `Fork of ${source.title}`.slice(0, 120);
      // Legacy revisions retain unknown provenance. The new publication uses the
      // current project license only after the user confirms their publication rights.
      const license = revision.license ?? source.license;
      const project = await tx.project.create({
        data: {
          slug: `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`, title,
          description: source.description, license, forkedFromLicense: revision.license,
          isPublic: true, publicationConfirmedAt: new Date(), publicationConfirmedBy: session.user.id,
          coverUrl: source.coverUrl, ownerId: session.user.id,
          forkedFromProjectId: source.id, forkedFromRevisionId: revision.id,
        },
        include: { owner: { select: { name: true } }, forkedFrom: { select: { slug: true, title: true, owner: { select: { name: true } } } }, forkedFromRevision: { select: { number: true } } },
      });
      const staged = await tx.revision.create({
        data: {
          projectId: project.id, number: 1, title: revision.title,
          changeDescription: `Forked from Revision ${revision.number} of ${source.slug}`.slice(0, 500),
          license, sourceKey: revision.sourceKey, sourceUrl: revision.sourceUrl,
          tool: revision.tool, toolVersion: revision.toolVersion, tags: revision.tags,
          sourceChecksum: revision.sourceChecksum, isPublished: false,
          // Immutable objects can be shared. These independent references keep
          // asset access working when the upstream project becomes private.
          previews: { create: revision.previews.map(({ position, key, url, mimeType, size, altText }) => ({ position, key, url, mimeType, size, altText })) },
        },
      });
      await tx.revision.update({ where: { id: staged.id }, data: { isPublished: true } });
      if (source.ownerId !== session.user.id) {
        await tx.notification.create({ data: { recipientId: source.ownerId, actorId: session.user.id, type: "FORK_CREATED", projectId: source.id, forkedProjectId: project.id } });
      }
      return project;
    });
    return NextResponse.json({ ...fork, coverUrl: publicAssetUrl(fork.coverUrl) }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ForkError) return NextResponse.json({ error: cause.message }, { status: cause.status });
    console.error("revision fork failed", cause);
    return NextResponse.json({ error: "Fork could not be created" }, { status: 500 });
  }
}

class ForkError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
