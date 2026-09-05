import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import ReportForm from "../../reports/report-form";
import IssueBoard from "./issue-board";
import RevisionPublishForm from "./revision-publish-form";
import ProjectSettingsForm from "./project-settings-form";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true } },
      revisions: { orderBy: { number: "asc" }, select: { id: true, number: true, title: true, changeDescription: true, tool: true, toolVersion: true, tags: true, sourceChecksum: true, contributorId: true, contributorName: true, acceptedByName: true, acceptedContributionId: true, createdAt: true, previews: { orderBy: { position: "asc" }, select: { id: true, position: true, altText: true } } } },
      issues: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } }, revision: { select: { number: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } } },
      forks: { where: { isPublic: true }, orderBy: [{ createdAt: "desc" }, { slug: "desc" }], take: 20, select: { id: true, slug: true, title: true, description: true, license: true, createdAt: true, owner: { select: { name: true } } } },
      _count: { select: { forks: { where: { isPublic: true } } } },
      forkedFrom: { select: { slug: true, title: true, owner: { select: { name: true } } } },
      forkedFromRevision: { select: { number: true } },
    },
  });
  if (!project) notFound();
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();
  const initial = project.title.slice(0, 1).toUpperCase();
  return <article className="detail repo-detail">
    <header className="repo-header">
      <div className="repo-header-main">
        <div className="repo-avatar" aria-hidden="true">{initial}</div>
        <div>
          <p className="repo-path"><Link href="/">Open Design Registry</Link> / {project.slug}</p>
          <div className="repo-title-row"><h1>{project.title}</h1><span className={`repo-visibility ${project.isPublic ? "public" : "private"}`}>{project.isPublic ? "Public" : "Private"}</span></div>
          <p className="lede">{project.description || "No description provided."}</p>
          {project.forkedFrom && <p className="repo-lineage">Forked from <Link href={`/projects/${project.forkedFrom.slug}`}>{project.forkedFrom.title}</Link> · Revision {project.forkedFromRevision?.number ?? "unknown"} · Original author {project.forkedFrom.owner.name} · Original revision license {project.forkedFromLicense ?? "not recorded"}</p>}
        </div>
      </div>
      <div className="repo-header-meta"><span>Owner <strong>{project.owner.name}</strong></span><span>License <strong>{project.license}</strong></span><span><strong>{project.revisions.length}</strong> revisions</span></div>
    </header>
    <nav className="repo-tabs" aria-label="Project sections">
      <Link className="repo-tab" href={`/projects/${project.slug}/contributions`}>Contributions</Link>
      <a className="repo-tab" href="#preview">Preview</a>
      <a className="repo-tab" href="#revisions">Revisions <span className="repo-tab-count">{project.revisions.length}</span></a>
      <a className="repo-tab" href="#issues">Issues <span className="repo-tab-count">{project.issues.length}</span></a>
      <a className="repo-tab" href="#forks">Forks <span className="repo-tab-count">{project._count.forks}</span></a>
    </nav>
    <section id="preview" className="repo-panel" aria-labelledby="preview-heading">
      <div className="section-heading"><h2 id="preview-heading">Preview</h2><span className="meta">Latest project cover</span></div>
      <img className="repo-preview-image" src={publicAssetUrl(project.coverUrl)} alt={`${project.title} cover`} />
    </section>
    {session?.user.id === project.ownerId && <ProjectSettingsForm slug={project.slug} title={project.title} description={project.description} license={project.license} isPublic={project.isPublic} />}
    <section id="revisions" className="repo-panel" aria-labelledby="revision-history">
      <div className="section-heading"><h2 id="revision-history">Revisions</h2><span className="meta">Commit history</span></div>
      {project.revisions.length ? <ol className="commit-list">{project.revisions.map((revision) => <li className="commit-row" key={revision.id}>
        <span className="commit-avatar" aria-hidden="true">{project.owner.name.slice(0, 1).toUpperCase()}</span>
        <div className="commit-main">
          <Link className="commit-title" href={`/projects/${project.slug}/revisions/${revision.number}`}>{revision.changeDescription || revision.title}</Link>
          <p className="commit-subject">{revision.title}</p>
          <div className="commit-meta"><span>{revision.contributorName ?? project.owner.name}</span>{revision.acceptedContributionId && <Link href={`/projects/${slug}/contributions/${revision.acceptedContributionId}`}>Reviewed contribution · accepted by {revision.acceptedByName}</Link>}<span>Revision <code>{revision.id.slice(0, 8)}</code></span>{revision.tool && <span>{revision.tool}{revision.toolVersion ? ` ${revision.toolVersion}` : ""}</span>}{revision.tags.map((tag) => <span className="topic-tag" key={tag}>{tag}</span>)}</div>
          {revision.previews.length > 0 && <ul className="commit-previews" aria-label={`Revision ${revision.number} preview alt text`}>{revision.previews.map((preview) => <li className="commit-chip" key={preview.id}>Preview {preview.position + 1}: {preview.altText}</li>)}</ul>}
        </div>
        <time className="commit-time" dateTime={revision.createdAt.toISOString()}>{formatDate(revision.createdAt)}</time>
      </li>)}</ol> : <p className="empty-state">No revisions published yet.</p>}
    </section>
    {session?.user.id === project.ownerId && <RevisionPublishForm slug={project.slug} />}
    {project.revisions.some((revision) => revision.contributorId) && <section className="repo-panel"><h2>Contributors</h2><ul>{[...new Map(project.revisions.filter((revision) => revision.contributorId).map((revision) => [revision.contributorId, revision.contributorName])).entries()].map(([id, name]) => <li key={id}>{name}</li>)}</ul></section>}
    <IssueBoard slug={project.slug} issues={project.issues} revisions={project.revisions} canManage={project.isPublic && session?.user.id === project.ownerId} signedIn={project.isPublic && Boolean(session)} />
    <section id="forks" className="repo-panel" aria-labelledby="forks-heading">
      <div className="section-heading"><h2 id="forks-heading">Forks</h2><span className="meta">Project descendants</span></div>
      {project.forks.length ? <div className="repo-list">{project.forks.map((fork) => <article className="repo-row" key={fork.id}><div className="repo-row-main"><div className="repo-row-heading"><Link className="repo-name" href={`/projects/${fork.slug}`}>{fork.title}</Link><span className="repo-visibility public">Public</span></div><p className="repo-description">{fork.description || "No description provided."}</p><div className="repo-meta"><span>{fork.owner.name}</span><span>{fork.license}</span><span>Created <time dateTime={fork.createdAt.toISOString()}>{formatDate(fork.createdAt)}</time></span></div></div></article>)}</div> : <p className="empty-state">No forks yet.</p>}
    </section>
    {project.isPublic && <ReportForm projectSlug={project.slug} />}
  </article>;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
