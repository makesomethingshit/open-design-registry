import Link from "next/link";
import { notFound } from "next/navigation";
import CapabilityBadge from "@/app/capability-badge";
import ReportForm from "@/app/reports/report-form";
import { ProjectHeader } from "@/src/components/design/project-header";
import { RevisionItem } from "@/src/components/design/revision-item";
import { Badge, StatusBadge } from "@/src/components/ui/badge";
import { Banner } from "@/src/components/ui/banner";
import { FormColumn, PageGrid, WideColumn } from "@/src/components/ui/layout";
import { SectionNav } from "@/src/components/ui/section-nav";
import { listProjectAttribution, type AttributionPerson, type AttributionRole } from "@/src/lib/attribution";
import { changeSummary, countVisibleProposals, findVisibleProposal, isVisible, listVisibleProposalSummaries } from "@/src/lib/proposal-handlers";
import { publicBundleFiles, readRevisionBundle } from "@/src/lib/revision-bundle";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";
import { prisma } from "@/src/lib/prisma";
import ContributeDialog from "./contribute-dialog";
import { ProjectStarButton } from "./project-star-button";
import { ProjectWatchButton } from "./project-watch-button";
import IssueBoard from "./issue-board";
import ProjectDocument from "./project-document";
import ProjectSettingsForm from "./project-settings-form";
import ProposalList, { type ProposalListItem } from "./proposal-list";
import RevisionPublishForm from "./revision-publish-form";
import styles from "./project.module.css";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ proposalStatus?: string; contributionTarget?: string; baseRevision?: string; relatedIssue?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedContributionBase = Number(query.baseRevision);
  const contributionReturn = query.contributionTarget?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i) && Number.isInteger(requestedContributionBase) && requestedContributionBase > 0
    ? { targetSlug: query.contributionTarget, baseRevision: requestedContributionBase, relatedIssueId: query.relatedIssue?.slice(0, 200) }
    : undefined;
  const session = await getSession();
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { name: true } },
      revisions: { where: { isPublished: true }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true, changeDescription: true, tool: true, toolVersion: true, tags: true, sourceChecksum: true, sourceKey: true, capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true, createdAt: true, publishedBy: { select: { name: true } }, previews: { orderBy: { position: "asc" }, select: { id: true, position: true, url: true, mimeType: true, altText: true } }, appliedProposal: { select: { id: true, proposalNumber: true, author: { select: { name: true } } } }, appliedChanges: { select: { id: true } } } },
      releases: { orderBy: { number: "desc" }, select: { id: true, number: true, title: true, description: true, createdAt: true, publishedBy: { select: { name: true } }, _count: { select: { revisions: true } } } },
      issues: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } }, revision: { select: { number: true } }, sourceDiscussion: { select: { id: true, title: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } }, proposals: { orderBy: [{ updatedAt: "desc" }, { id: "desc" }], where: { project: session?.user.id ? { slug, OR: [{ isPublic: true }, { ownerId: session.user.id }] } : { slug, isPublic: true }, baseRevision: { project: { slug }, isPublished: true }, sourceRevision: { isPublished: true, project: session?.user.id ? { OR: [{ isPublic: true }, { ownerId: session.user.id }] } : { isPublic: true } } }, select: { id: true, proposalNumber: true, title: true, status: true, project: { select: { id: true, ownerId: true, isPublic: true } }, baseRevision: { select: { projectId: true, isPublished: true } }, sourceRevision: { select: { isPublished: true, project: { select: { ownerId: true, isPublic: true } } } }, appliedRevisions: { where: { isPublished: true }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } } } } } },
      discussions: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, createdAt: true, author: { select: { name: true } }, _count: { select: { comments: true } } } },
      forks: { where: { isPublic: true }, orderBy: [{ createdAt: "desc" }, { slug: "desc" }], take: 20, select: { id: true, slug: true, title: true, description: true, license: true, createdAt: true, owner: { select: { name: true } } } },
      _count: { select: { forks: { where: { isPublic: true } } } },
      forkedFrom: { select: { slug: true, title: true, owner: { select: { name: true } } } },
      forkedFromRevision: { select: { number: true } },
    },
  });
  if (!project) notFound();

  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();

  const proposalFilter = query.proposalStatus === "closed" ? "closed" : "open";
  const latestRevision = project.revisions.at(-1);
  const [proposalPage, activeProposalPage, activeProposalCount, attribution, latestProposal, starCount, watchCount] = await Promise.all([
    listVisibleProposalSummaries(project.id, session?.user.id, { status: proposalFilter, take: 20 }),
    listVisibleProposalSummaries(project.id, session?.user.id, { status: "open", take: 3 }),
    countVisibleProposals(project.id, session?.user.id, "open"),
    listProjectAttribution(project.id, session?.user.id),
    latestRevision?.appliedProposal ? findVisibleProposal(latestRevision.appliedProposal.id, session?.user.id) : Promise.resolve(null),
    project.isPublic && session ? prisma.projectStar.count({ where: { userId: session.user.id, projectId: project.id } }) : Promise.resolve(0),
    project.isPublic && session ? prisma.projectWatch.count({ where: { userId: session.user.id, projectId: project.id } }) : Promise.resolve(0),
  ]);
  const initialStarred = starCount > 0;
  const initialWatched = watchCount > 0;
  const activeProposals = activeProposalPage.items;
  const proposalRows: ProposalListItem[] = proposalPage.items;
  const latestFiles = publicBundleFiles(await readRevisionBundle(latestRevision?.sourceKey));
  const latestPreview = latestRevision?.previews.find((preview) => preview.mimeType !== "text/html");
  const visibleIssues = project.issues.map((issue) => ({
    ...issue,
    proposals: issue.proposals
      .filter((proposal) => isVisible(proposal, session?.user.id))
      .map(({ id, proposalNumber, title, status, appliedRevisions }) => ({ id, proposalNumber, title, status, appliedRevisions })),
  }));
  const openIssues = visibleIssues.filter((issue) => issue.status === "OPEN" && issue.kind !== "DESIGN_REQUEST");
  const openDesignRequests = visibleIssues.filter((issue) => issue.status === "OPEN" && issue.kind === "DESIGN_REQUEST");
  const contributors = attribution.length;
  const navigationItems = [
    { href: "#overview", label: "Overview" },
    { href: "#revisions", label: <>Revisions <span className={styles.navCount}>{project.revisions.length}</span></> },
    { href: "#releases", label: <>Releases <span className={styles.navCount}>{project.releases.length}</span></> },
    { href: "#discussions", label: <>Discussions <span className={styles.navCount}>{project.discussions.length}</span></> },
    { href: "#issues", label: <>Issues <span className={styles.navCount}>{project.issues.length}</span></> },
    { href: "#proposals", label: <>Proposals <span className={styles.navCount}>{activeProposalCount}</span></> },
    { href: "#contributors", label: <>Contributors <span className={styles.navCount}>{contributors}</span></> },
    { href: "#forks", label: <>Forks <span className={styles.navCount}>{project._count.forks}</span></> },
  ];

  return <PageGrid aria-labelledby="project-title">
    <WideColumn>
      <article className={styles.project}>
    <ProjectHeader
      activityStatus={project.activityStatus}
       actions={<>{latestRevision && <CapabilityBadge adapterConfidence={latestRevision.adapterConfidence} adapterId={latestRevision.adapterId} adapterMaturity={latestRevision.adapterMaturity} adapterVersion={latestRevision.adapterVersion} label="Contribution scope" mode={latestRevision.capabilityMode} unitCount={latestRevision.capabilityUnitCount} />}{project.isPublic && <ProjectStarButton initialStarred={initialStarred} key={project.slug} signedIn={Boolean(session)} slug={project.slug} />}{project.isPublic && <ProjectWatchButton initialWatched={initialWatched} signedIn={Boolean(session)} slug={project.slug} />}<ContributeDialog revisionNumber={latestRevision?.number} signedIn={Boolean(session)} slug={project.slug} /><ContributeDialog initialIntent="fork" revisionNumber={latestRevision?.number} signedIn={Boolean(session)} slug={project.slug} /></>}
      description={project.description}
      license={project.license}
      lineage={project.forkedFrom && <>Forked from <Link href={`/projects/${project.forkedFrom.slug}`}>{project.forkedFrom.title}</Link> <span aria-hidden="true">·</span> Revision {project.forkedFromRevision?.number ?? "unknown"} <span aria-hidden="true">·</span> Original author {project.forkedFrom.owner.name} <span aria-hidden="true">·</span> Original revision license {project.forkedFromLicense ?? "not recorded"}</>}
      owner={project.owner.name}
      revisionCount={project.revisions.length}
      slug={project.slug}
      title={project.title}
      visibility={project.isPublic ? "public" : "private"}
    />
    <SectionNav items={navigationItems} label="Project sections" />

    <section aria-labelledby="overview-heading" className={styles.section} id="overview">
      <div className={styles.overviewGrid}>
        <figure className={styles.artwork} id="preview">
          <img alt={latestPreview?.altText ?? `${project.title} cover`} src={publicAssetUrl(latestPreview?.url ?? project.coverUrl)} />
          <figcaption>{latestRevision ? `Revision ${latestRevision.number}` : "Project cover"}</figcaption>
        </figure>
        <aside className={styles.infoRail}>
          <section><p className={styles.eyebrow}>Project information</p><h2 id="overview-heading">About</h2>{project.description ? <p className={styles.prose}>{project.description}</p> : <p className={styles.muted}>No project description has been added.</p>}</section>
          <dl className={styles.infoList}>
            <div><dt>License</dt><dd>{project.license}</dd></div>
            <div><dt>Owner</dt><dd>{project.owner.name}</dd></div>
            <div><dt>Contributions</dt><dd>{latestRevision ? <>Open from <Link href={`/projects/${project.slug}/revisions/${latestRevision.number}`}>Revision {latestRevision.number}</Link></> : "Publish a revision to open contributions."}</dd></div>
          </dl>
          <dl className={styles.metrics}>
            <div><dt>Contributors</dt><dd>{contributors}</dd></div>
            <div><dt>Revisions</dt><dd>{project.revisions.length}</dd></div>
            <div><dt>Open issues</dt><dd>{openIssues.length}</dd></div>
            <div><dt>Open proposals</dt><dd>{activeProposalCount}</dd></div>
          </dl>
          {!project.isPublic && session?.user.id === project.ownerId && <p className={styles.privateNote}>Private workspace visible to you.</p>}
        </aside>
        <ProjectDocument document={project.document ?? ""} isOwner={session?.user.id === project.ownerId} slug={project.slug} />
        <div className={styles.activityGrid}>
          <section className={styles.activity}>
            <header><h2>Looking for contributions</h2><Link href="#issues">View issues</Link></header>
            {openDesignRequests.length ? <div className={styles.activityList}>{openDesignRequests.slice(0, 3).map((issue) => <article key={issue.id}><strong>{issue.title}</strong><span>Opened by {issue.author.name}</span></article>)}</div> : <p className={styles.muted}>No open design requests.</p>}
          </section>
          <section className={styles.activity}>
            <header><h2>Active proposals</h2><Link href="#proposals">View proposals</Link></header>
            {activeProposals.length ? <div className={styles.activityList}>{activeProposals.map((proposal) => {
              const presentation = proposalStatusPresentation(proposal.status, proposal.applied, proposal.total);
              return <article key={proposal.id}><div><Link href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} <span aria-hidden="true">·</span> {proposal.title}</Link><p>Approved {proposal.approved}/{proposal.total}{proposal.applied ? ` · Applied ${proposal.applied}/${proposal.total}` : ""}</p>{proposal.summaries.length > 0 && <p>{proposal.summaries.join(" · ")}{proposal.moreChanges ? ` · ${proposal.moreChanges} more changes` : ""}</p>}</div><StatusBadge icon={presentation.icon} tone={presentation.tone}>{presentation.label}</StatusBadge><CapabilityBadge adapterConfidence={proposal.capability.adapterConfidence} adapterId={proposal.capability.adapterId} adapterMaturity={proposal.capability.adapterMaturity} adapterVersion={proposal.capability.adapterVersion} mode={proposal.capability.mode} unitCount={proposal.capability.unitCount} /></article>;
            })}</div> : <p className={styles.muted}>No active proposals yet.</p>}
          </section>
        </div>
        {latestRevision && <section className={styles.latestRevision}>
          <p className={styles.eyebrow}>Current work</p><h2>Latest revision</h2>
          <ol className={styles.revisionList}><RevisionItem capability={<><CapabilityBadge adapterConfidence={latestRevision.adapterConfidence} adapterId={latestRevision.adapterId} adapterMaturity={latestRevision.adapterMaturity} adapterVersion={latestRevision.adapterVersion} mode={latestRevision.capabilityMode} unitCount={latestRevision.capabilityUnitCount} />{latestProposal ? <><p className={styles.revisionNote}>Applied {Math.max(1, latestRevision.appliedChanges.length)} changes from <Link href={`/proposals/${latestProposal.id}`}>Proposal #{latestProposal.proposalNumber}</Link> <span aria-hidden="true">·</span> Contributor {latestProposal.author.name}</p><p className={styles.revisionNote}>{latestProposal.changeSet?.changes.filter((change) => change.appliedRevisionId === latestRevision.id).slice(0, 2).map(changeSummary).join(" · ")}</p></> : undefined}</>} changeDescription={latestRevision.changeDescription} createdAt={latestRevision.createdAt} href={`/projects/${project.slug}/revisions/${latestRevision.number}`} id={latestRevision.id} key={latestRevision.id} number={latestRevision.number} publisher={latestRevision.publishedBy?.name} tags={latestRevision.tags} title={latestRevision.title} tool={latestRevision.tool} /></ol>
        </section>}
      </div>
    </section>

    {session?.user.id === project.ownerId && contributionReturn && <Banner title="Prepare your working revision" tone="info">Edit the source in an external design tool, then publish a new revision here. Publishing returns to the target contribution workspace.</Banner>}
    {session?.user.id === project.ownerId && <details className={styles.ownerTools} id="owner-tools" open={Boolean(contributionReturn)}><summary>Owner tools</summary><div><PageGrid><FormColumn><ProjectSettingsForm activityStatus={project.activityStatus} description={project.description} document={project.document ?? ""} isPublic={project.isPublic} license={project.license} slug={project.slug} title={project.title} /></FormColumn><FormColumn><RevisionPublishForm contributionReturn={contributionReturn} existingFiles={latestFiles} slug={project.slug} /></FormColumn></PageGrid></div></details>}

    <section aria-labelledby="revision-history" className={styles.section} id="revisions">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>History</p><h2 id="revision-history">Revisions</h2></div><span>Commit history</span></header>
      {project.revisions.length ? <ol className={styles.revisionList}>{project.revisions.map((revision) => <RevisionItem capability={<CapabilityBadge adapterConfidence={revision.adapterConfidence} adapterId={revision.adapterId} adapterMaturity={revision.adapterMaturity} adapterVersion={revision.adapterVersion} mode={revision.capabilityMode} unitCount={revision.capabilityUnitCount} />} changeDescription={revision.changeDescription} createdAt={revision.createdAt} href={`/projects/${project.slug}/revisions/${revision.number}`} id={revision.id} key={revision.id} number={revision.number} publisher={revision.publishedBy?.name} tags={revision.tags} title={revision.title} tool={revision.tool ? `${revision.tool}${revision.toolVersion ? ` ${revision.toolVersion}` : ""}` : null} />)}</ol> : <p className={styles.muted}>No revisions published yet.</p>}
    </section>

    <section aria-labelledby="releases-heading" className={styles.section} id="releases">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>History</p><h2 id="releases-heading">Releases</h2></div>{session?.user.id === project.ownerId && <Link className={styles.secondaryLink} href={`/projects/${project.slug}/releases/new`}>Publish release</Link>}</header>
      {project.releases.length ? <ul className={styles.releaseList}>{project.releases.map((release) => <li key={release.id}>
        <Link className={styles.releaseRowLink} href={`/projects/${project.slug}/releases/${release.number}`}>
          <strong>Release {release.number} <span aria-hidden="true">·</span> {release.title}</strong>
          <span>{release._count.revisions} {release._count.revisions === 1 ? "revision" : "revisions"} <span aria-hidden="true">·</span> <time dateTime={release.createdAt.toISOString()}>{release.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></span>
        </Link>
      </li>)}</ul> : <p className={styles.muted}>No releases yet.</p>}
    </section>

    <section aria-labelledby="discussions-heading" className={`${styles.section} ${styles.discussionSection}`} id="discussions">
      <header className={styles.sectionHeader}>
        <div><p className={styles.eyebrow}>Collaboration</p><h2 id="discussions-heading">Discussions</h2><p className={styles.discussionIntro}>Ideas, questions and design direction for this project.</p></div>
        {project.isPublic && (session
          ? <Link className={styles.discussionStartLink} href={`/projects/${project.slug}/discussions/new`}>Start a discussion</Link>
          : <Link className={styles.discussionStartLink} href={`/login?next=${encodeURIComponent(`/projects/${project.slug}/discussions/new`)}`}>Sign in to start a discussion</Link>)}
      </header>
      {project.discussions.length ? <ul className={styles.discussionList}>{project.discussions.map((discussion) => <li key={discussion.id}>
        <Link className={styles.discussionRowLink} href={`/projects/${project.slug}/discussions/${discussion.id}`}>
          <strong>{discussion.title}</strong>
          <span>{discussion.author.name} <span aria-hidden="true">·</span> <time dateTime={discussion.createdAt.toISOString()}>{discussion.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time> <span aria-hidden="true">·</span> {discussion._count.comments} {discussion._count.comments === 1 ? "comment" : "comments"}</span>
        </Link>
      </li>)}</ul> : <p className={styles.muted}>No discussions yet.</p>}
      <p className={styles.discussionSort}>Newest discussions first</p>
    </section>

    <IssueBoard canManage={project.isPublic && session?.user.id === project.ownerId} issues={visibleIssues} revisions={project.revisions} signedIn={project.isPublic && Boolean(session)} slug={project.slug} />
    <section aria-labelledby="proposals-heading" className={styles.section} id="proposals">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Collaboration</p><h2 id="proposals-heading">Proposals</h2></div>{session && latestRevision && <Link className={styles.secondaryLink} href={`/projects/${project.slug}/contribute`}>New proposal</Link>}</header>
      <ProposalList initialCursor={proposalPage.nextCursor} initialFilter={proposalFilter} initialItems={proposalRows} slug={project.slug} />
    </section>
    <section aria-labelledby="contributors-heading" className={styles.section} id="contributors">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Collaboration</p><h2 id="contributors-heading">Contributors</h2></div><span>{contributors} people</span></header>
      <ul className={styles.contributorList}>{attribution.map((person) => <li key={person.id}><div><strong>{person.name}</strong><div className={styles.contributorRoles}>{person.roles.map((role) => <Badge key={role}>{roleLabel(role)}</Badge>)}</div></div><span>{attributionMetrics(person).join(" · ")}</span></li>)}</ul>
    </section>
    <section aria-labelledby="forks-heading" className={styles.section} id="forks">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Lineage</p><h2 id="forks-heading">Forks</h2></div><span>Project descendants</span></header>
      {project.forks.length ? <ul className={styles.forkList}>{project.forks.map((fork) => <li key={fork.id}><Link href={`/projects/${fork.slug}`}>{fork.title}</Link>{fork.description && <p>{fork.description}</p>}<span>{fork.owner.name} <span aria-hidden="true">·</span> {fork.license} <span aria-hidden="true">·</span> Created <time dateTime={fork.createdAt.toISOString()}>{formatDate(fork.createdAt)}</time></span></li>)}</ul> : <p className={styles.muted}>No forks yet.</p>}
    </section>
        {project.isPublic && <PageGrid><FormColumn><ReportForm projectSlug={project.slug} /></FormColumn></PageGrid>}
      </article>
    </WideColumn>
  </PageGrid>;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function roleLabel(role: AttributionRole) {
  return role[0] + role.slice(1).toLowerCase();
}

function attributionMetrics(person: AttributionPerson) {
  return [
    person.appliedChanges && `${person.appliedChanges} applied ${person.appliedChanges === 1 ? "change" : "changes"}`,
    person.appliedRevisions && `${person.appliedRevisions} applied ${person.appliedRevisions === 1 ? "revision" : "revisions"}`,
    person.reviewedChanges && `${person.reviewedChanges} applied ${person.reviewedChanges === 1 ? "change" : "changes"} reviewed`,
  ].filter(Boolean) as string[];
}
