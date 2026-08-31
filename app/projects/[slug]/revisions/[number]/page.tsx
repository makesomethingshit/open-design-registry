import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { revisionUrlSchema } from "@/src/lib/project-validation";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import RevisionDiff from "../../revision-diff";
import ReportForm from "../../../../reports/report-form";
import ForkForm from "./fork-form";

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
  const currentPreviews = revision.previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) }));
  const previousPreviews = previous?.previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) }));
  const sourceUrl = revision.sourceUrl && revisionUrlSchema.safeParse(revision.sourceUrl).success ? revision.sourceUrl : null;
  const sourceHref = sourceUrl ?? (revision.sourceKey ? publicAssetUrl(revision.sourceKey) : null);
  return <article className="detail">
    <p className="meta"><Link href={`/projects/${project.slug}`}>{project.title}</Link> · Revision {revision.number}</p>
    <h1>{revision.title}</h1>
    <p className="meta">Published by {project.owner.name} · <time dateTime={revision.createdAt.toISOString()}>{revision.createdAt.toLocaleString("ko-KR")}</time></p>
    <p>{revision.changeDescription}</p>
    {sourceHref && <section aria-labelledby="revision-source"><h2 id="revision-source">Source</h2><a className="button secondary" href={sourceHref} {...(sourceUrl ? { target: "_blank", rel: "noreferrer" } : { download: true })}>{sourceUrl ? "Open source link" : "Download original file"}</a></section>}
    <RevisionDiff current={currentPreviews} previous={previousPreviews} currentNumber={revision.number} previousNumber={previous?.number} /><ForkForm slug={project.slug} number={revision.number} license={project.license} signedIn={project.isPublic && Boolean(session)} /><ReportForm revisionId={revision.id} />
  </article>;
}
