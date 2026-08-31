import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import ReportForm from "../../reports/report-form";
import IssueBoard from "./issue-board";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    include: { owner: { select: { name: true } }, revisions: { orderBy: { number: "asc" }, select: { id: true, number: true, changeDescription: true, createdAt: true } }, forkedFrom: { select: { slug: true, title: true, owner: { select: { name: true } } } }, forkedFromRevision: { select: { number: true } }, issues: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } }, revision: { select: { number: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } } } },
  });
  if (!project) notFound();
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();
  return <article className="detail">
    <p className="meta">{project.owner.name} · {project.license} · {project.isPublic ? "Public" : "Private"}</p>
    <h1>{project.title}</h1><p className="lede">{project.description}</p>
    {project.forkedFrom && <p className="meta">Forked from <Link href={`/projects/${project.forkedFrom.slug}`}>{project.forkedFrom.title}</Link>, Revision {project.forkedFromRevision?.number ?? "unknown"} · Original author {project.forkedFrom.owner.name} · License {project.forkedFromLicense ?? project.license}</p>}
    <img src={project.coverUrl} alt={`${project.title} cover`} />
    <section aria-labelledby="revision-history"><h2 id="revision-history">Revision history</h2>{project.revisions.length ? <ol className="history">{project.revisions.map((revision) => <li key={revision.id}>
      <div className="history-entry"><Link href={`/projects/${project.slug}/revisions/${revision.number}`}><strong>Revision {revision.number}</strong></Link><span className="meta">Published by {project.owner.name} · <time dateTime={revision.createdAt.toISOString()}>{revision.createdAt.toLocaleString("ko-KR")}</time></span><p>{revision.changeDescription || "No change description provided."}</p></div>
    </li>)}</ol> : <p>No revisions published yet.</p>}</section><IssueBoard slug={project.slug} issues={project.issues} revisions={project.revisions} canManage={project.isPublic && session?.user.id === project.ownerId} signedIn={project.isPublic && Boolean(session)} /><ReportForm projectSlug={project.slug} />
  </article>;
}
