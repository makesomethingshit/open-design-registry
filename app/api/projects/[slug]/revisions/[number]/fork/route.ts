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
  const source = await prisma.project.findUnique({ where: { slug: sourceSlug }, include: { owner: { select: { id: true, name: true } }, revisions: { where: { number: revisionNumber }, select: { id: true, number: true } } } });
  const revision = source?.revisions[0];
  if (!source?.isPublic || !revision) return NextResponse.json({ error: "Public revision not found" }, { status: 404 });
  const requestedTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const titleValue = requestedTitle || `Fork of ${source.title}`.slice(0, 120);
  if (titleValue.length > 120) return NextResponse.json({ error: "Title must be 120 characters or fewer" }, { status: 400 });
  const slug = `${slugify(titleValue)}-${crypto.randomUUID().slice(0, 8)}`;
  const fork = await prisma.project.create({ data: { slug, title: titleValue, description: source.description, license: source.license, forkedFromLicense: source.license, isPublic: true, publicationConfirmedAt: new Date(), publicationConfirmedBy: session.user.id, coverUrl: source.coverUrl, ownerId: session.user.id, forkedFromProjectId: source.id, forkedFromRevisionId: revision.id }, include: { owner: { select: { name: true } }, forkedFrom: { select: { slug: true, title: true, owner: { select: { name: true } } } }, forkedFromRevision: { select: { number: true } } } });
  return NextResponse.json({ ...fork, coverUrl: publicAssetUrl(fork.coverUrl) }, { status: 201 });
}
