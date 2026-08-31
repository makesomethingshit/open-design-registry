import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import RevisionDiff from "../../revision-diff";
import ReportForm from "../../../../reports/report-form";

export const dynamic = "force-dynamic";

export default async function RevisionPage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) notFound();
  const project = await prisma.project.findUnique({ where: { slug }, include: { owner: { select: { name: true } } } });
  if (!project) notFound();
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();
  const revision = await prisma.revision.findUnique({ where: { projectId_number: { projectId: project.id, number: revisionNumber } }, include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } });
  if (!revision) notFound();
  const previous = revision.parentId ? await prisma.revision.findUnique({ where: { id: revision.parentId }, include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } }) : null;
  return <article className="detail">
    <p className="meta"><Link href={`/projects/${project.slug}`}>{project.title}</Link> · Revision {revision.number}</p>
    <h1>Revision {revision.number}</h1>
    <p className="meta">Published by {project.owner.name} · <time dateTime={revision.createdAt.toISOString()}>{revision.createdAt.toLocaleString("ko-KR")}</time></p>
    <p>{revision.changeDescription || "No change description provided."}</p>
    <RevisionDiff current={revision.previews} previous={previous?.previews} currentNumber={revision.number} previousNumber={previous?.number} /><ReportForm revisionId={revision.id} />
  </article>;
}
