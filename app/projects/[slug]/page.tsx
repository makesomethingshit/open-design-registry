import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { countVisibleProposals, findVisibleProposal, listVisibleProposalSummaries, visibleProposalContributorIds } from "@/src/lib/proposal-handlers";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import { publicBundleFiles, readRevisionBundle } from "@/src/lib/revision-bundle";
import ReportForm from "../../reports/report-form";
import IssueBoard from "./issue-board";
import RevisionPublishForm from "./revision-publish-form";
import ProjectSettingsForm from "./project-settings-form";
import ContributeDialog from "./contribute-dialog";
import ProposalList, { type ProposalListItem } from "./proposal-list";
import CapabilityBadge from "@/app/capability-badge";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ proposalStatus?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true } },
      revisions: { where: { isPublished: true }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, changeDescription: true, tool: true, toolVersion: true, tags: true, sourceChecksum: true, sourceKey: true, capabilityMode: true, capabilityUnitCount: true, createdAt: true, previews: { orderBy: { position: "asc" }, select: { id: true, position: true, url: true, mimeType: true, altText: true } }, appliedProposal: { select: { id: true, proposalNumber: true, author: { select: { name: true } } } }, appliedChanges: { select: { id: true } } } },
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
  const proposalFilter = query.proposalStatus === "closed" ? "closed" : "open";
  const latestRevision = project.revisions.at(-1);
  const [proposalPage, activeProposalPage, activeProposalCount, contributorIds, latestProposal] = await Promise.all([
    listVisibleProposalSummaries(project.id, session?.user.id, { status: proposalFilter, take: 20 }),
    listVisibleProposalSummaries(project.id, session?.user.id, { status: "open", take: 3 }),
    countVisibleProposals(project.id, session?.user.id, "open"),
    visibleProposalContributorIds(project.id, session?.user.id),
    latestRevision?.appliedProposal ? findVisibleProposal(latestRevision.appliedProposal.id, session?.user.id) : Promise.resolve(null),
  ]);
  const activeProposals = activeProposalPage.items;
  const proposalRows: ProposalListItem[] = proposalPage.items;
  const proposalCursor = proposalPage.nextCursor;
  const latestFiles = publicBundleFiles(await readRevisionBundle(latestRevision?.sourceKey));
  const latestPreview = latestRevision?.previews.find((preview) => preview.mimeType !== "text/html");
  const openIssues = project.issues.filter((issue) => issue.status === "OPEN");
  const contributors = new Set([project.ownerId, ...contributorIds]).size;
  const initial = project.title.slice(0, 1).toUpperCase();
  return <article className="detail repo-detail">
    <header className="repo-header">
      <div className="repo-header-main">
        <div className="repo-avatar" aria-hidden="true">{initial}</div>
        <div>
          <p className="repo-path"><Link href="/">Open Design Registry</Link> / {project.slug}</p>
          <div className="repo-title-row"><h1>{project.title}</h1><span className={`repo-visibility ${project.isPublic ? "public" : "private"}`}>{project.isPublic ? "Public" : "Private"}</span></div>
          <p className="lede">{project.description || "No description provided."}</p>
          {!project.isPublic && session?.user.id === project.ownerId && <p className="meta">Private workspace · visible to you</p>}
          {project.forkedFrom && <p className="repo-lineage">Forked from <Link href={`/projects/${project.forkedFrom.slug}`}>{project.forkedFrom.title}</Link> · Revision {project.forkedFromRevision?.number ?? "unknown"} · Original author {project.forkedFrom.owner.name} · Original revision license {project.forkedFromLicense ?? "not recorded"}</p>}
        </div>
      </div>
      <div className="repo-header-meta"><span>Owner <strong>{project.owner.name}</strong></span><span>License <strong>{project.license}</strong></span><span><strong>{project.revisions.length}</strong> revisions</span><ContributeDialog slug={project.slug} revisionNumber={latestRevision?.number} signedIn={Boolean(session)} /><ContributeDialog slug={project.slug} revisionNumber={latestRevision?.number} signedIn={Boolean(session)} initialIntent="fork" /></div>
    </header>
    <nav className="repo-tabs" aria-label="Project sections">
      <a className="repo-tab" href="#overview">Overview</a>
      <a className="repo-tab" href="#revisions">Revisions <span className="repo-tab-count">{project.revisions.length}</span></a>
      <a className="repo-tab" href="#issues">Issues <span className="repo-tab-count">{project.issues.length}</span></a>
      <a className="repo-tab" href="#proposals">Proposals <span className="repo-tab-count">{activeProposalCount}</span></a>
      <a className="repo-tab" href="#forks">Forks <span className="repo-tab-count">{project._count.forks}</span></a>
    </nav>
    <section id="overview" className="repo-panel" aria-labelledby="overview-heading">
      <div className="section-heading"><h2 id="overview-heading">Overview</h2>{latestRevision && <Link className="button secondary" href={`/projects/${project.slug}/revisions/${latestRevision.number}`}>View revision</Link>}</div>
      <div id="preview"><img className="repo-preview-image" src={publicAssetUrl(latestPreview?.url ?? project.coverUrl)} alt={latestPreview?.altText ?? `${project.title} cover`} /></div>
      <section className="overview-about"><h3>About</h3><p>{project.description || "No description provided."}</p><dl className="project-counts"><div><dt>Contributors</dt><dd>{contributors}</dd></div><div><dt>Revisions</dt><dd>{project.revisions.length}</dd></div><div><dt>Open Issues</dt><dd>{openIssues.length}</dd></div><div><dt>Open Proposals</dt><dd>{activeProposalCount}</dd></div></dl></section>
      <div className="overview-grid"><section><div className="section-heading"><h3>Looking for contributions</h3><a href="#issues">View issues</a></div>{openIssues.length ? <div className="overview-list">{openIssues.slice(0, 3).map((issue) => <article className="overview-row" key={issue.id}><strong>{issue.title}</strong><span className="meta">Opened by {issue.author.name}</span></article>)}</div> : <p className="empty-state">No open issues you can help with.</p>}</section><section><div className="section-heading"><h3>Active proposals</h3><a href="#proposals">View proposals</a></div>{activeProposals.length ? <div className="overview-list">{activeProposals.map((proposal) => <article className="overview-row" key={proposal.id}><Link href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} · {proposal.title}</Link><CapabilityBadge mode={proposal.capability.mode} unitCount={proposal.capability.unitCount} /><span className="meta">{proposal.status.replaceAll("_", " ")} · Approved {proposal.approved}/{proposal.total}{proposal.applied ? ` · Applied ${proposal.applied}/${proposal.total}` : ""}</span>{proposal.summaries.length > 0 && <span className="meta">{proposal.summaries.join(" · ")}{proposal.moreChanges ? ` · ${proposal.moreChanges} more changes` : ""}</span>}</article>)}</div> : <p className="empty-state">No active proposals yet.</p>}</section></div>
      {latestRevision && <section className="latest-revision"><h3>Latest revision</h3><Link href={`/projects/${project.slug}/revisions/${latestRevision.number}`}>Revision {latestRevision.number}</Link><CapabilityBadge mode={latestRevision.capabilityMode} unitCount={latestRevision.capabilityUnitCount} />{latestProposal ? <><p className="meta">Applied {Math.max(1, latestRevision.appliedChanges.length)} changes from <Link href={`/proposals/${latestProposal.id}`}>Proposal #{latestProposal.proposalNumber}</Link> · Contributor {latestProposal.author.name}</p><p className="meta">{latestProposal.changeSet?.changes.filter((change) => change.appliedRevisionId === latestRevision.id).slice(0, 2).map(changeSummary).join(" · ")}</p></> : <p className="meta">{latestRevision.changeDescription}</p>}</section>}
    </section>
    {session?.user.id === project.ownerId && <ProjectSettingsForm slug={project.slug} title={project.title} description={project.description} license={project.license} isPublic={project.isPublic} />}
    <section id="revisions" className="repo-panel" aria-labelledby="revision-history">
      <div className="section-heading"><h2 id="revision-history">Revisions</h2><span className="meta">Commit history</span></div>
      {project.revisions.length ? <ol className="commit-list">{project.revisions.map((revision) => <li className="commit-row" key={revision.id}>
        <span className="commit-avatar" aria-hidden="true">{project.owner.name.slice(0, 1).toUpperCase()}</span>
        <div className="commit-main">
          <Link className="commit-title" href={`/projects/${project.slug}/revisions/${revision.number}`}>{revision.changeDescription || revision.title}</Link>
          <p className="commit-subject">{revision.title}</p>
          <CapabilityBadge mode={revision.capabilityMode} unitCount={revision.capabilityUnitCount} />
          <div className="commit-meta"><span>{project.owner.name}</span><span>Revision <code>{revision.id.slice(0, 8)}</code></span>{revision.tool && <span>{revision.tool}{revision.toolVersion ? ` ${revision.toolVersion}` : ""}</span>}{revision.tags.map((tag) => <span className="topic-tag" key={tag}>{tag}</span>)}</div>
          {revision.previews.length > 0 && <ul className="commit-previews" aria-label={`Revision ${revision.number} preview alt text`}>{revision.previews.map((preview) => <li className="commit-chip" key={preview.id}>Preview {preview.position + 1}: {preview.altText}</li>)}</ul>}
        </div>
        <time className="commit-time" dateTime={revision.createdAt.toISOString()}>{formatDate(revision.createdAt)}</time>
      </li>)}</ol> : <p className="empty-state">No revisions published yet.</p>}
    </section>
    {session?.user.id === project.ownerId && <RevisionPublishForm slug={project.slug} existingFiles={latestFiles} />}
    <IssueBoard slug={project.slug} issues={project.issues} revisions={project.revisions} canManage={project.isPublic && session?.user.id === project.ownerId} signedIn={project.isPublic && Boolean(session)} />
    <section id="proposals" className="repo-panel" aria-labelledby="proposals-heading">
      <div className="section-heading"><h2 id="proposals-heading">Proposals</h2>{session && latestRevision && <Link className="button secondary" href={`/projects/${project.slug}/proposals/new`}>New proposal</Link>}</div>
      <ProposalList slug={project.slug} initialFilter={proposalFilter} initialItems={proposalRows} initialCursor={proposalCursor} />
    </section>
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

function changeSummary(change: { type: string; action: string | null; target: string; name: string | null; newName: string | null }) {
  const name = change.name ?? change.target;
  const action = change.action ?? change.type;
  if (action === "RENAME_UNIT") return `Rename ${name} → ${change.newName ?? "new name"}`;
  if (action === "ADD_UNIT") return `Add ${name}`;
  if (action === "REMOVE_UNIT") return `Remove ${name}`;
  if (action === "MODIFY_UNIT") return `Modify ${name}`;
  return action === "REPLACE_DOCUMENT" ? "Whole document" : `Replace ${name}`;
}
