import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import CapabilityBadge from "@/app/capability-badge";
import ReportForm from "@/app/reports/report-form";
import { RevisionItem } from "@/src/components/design/revision-item";
import { Badge, StatusBadge } from "@/src/components/ui/badge";
import { Banner } from "@/src/components/ui/banner";
import { FormColumn, PageGrid } from "@/src/components/ui/layout";
import { RouteNav } from "@/src/components/ui/section-nav";
export type ProjectView = "overview" | "revisions" | "releases" | "discussions" | "issues" | "new-issue" | "proposals" | "contributors" | "forks" | "settings";
import { listProjectAttribution, type AttributionPerson, type AttributionRole } from "@/src/lib/attribution";
import { pageCursor, parsePageSize } from "@/src/lib/pagination";
import { changeSummary, countVisibleProposals, findVisibleProposal, listVisibleProposalSummaries } from "@/src/lib/proposal-handlers";
import { publicBundleFiles, readRevisionBundle } from "@/src/lib/revision-bundle";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";
import { prisma } from "@/src/lib/prisma";
import { canvasView, readCanvasPage } from "@/src/lib/canvas/service";
import { PrivateProjectWrite } from "@/src/lib/project-visibility-lock";
import IssueBoard from "./issue-board";
import ProjectDocument from "./project-document";
import ProjectAbout from "./project-about";
import ProjectSettingsForm from "./project-settings-form";
import ProposalList, { type ProposalListItem } from "./proposal-list";
import RevisionPublishForm from "./revision-publish-form";
import { CanvasMembership } from "./canvases/canvas-membership";
import styles from "./project.module.css";

export default async function ProjectScreen({ params, searchParams, view = "overview" }: { view?: ProjectView; params: Promise<{ slug: string }>; searchParams: Promise<{ proposalStatus?: string; issueStatus?: string; publish?: string; contributionTarget?: string; baseRevision?: string; relatedIssue?: string; pageSize?: string; cursor?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const pageSize = parsePageSize(query.pageSize ?? null);
  const cursor = pageCursor(query.cursor ?? null);
  const issueStatus = query.issueStatus === "closed" ? "CLOSED" : "OPEN";
  const requestedContributionBase = Number(query.baseRevision);
  const contributionReturn = query.contributionTarget?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i) && Number.isInteger(requestedContributionBase) && requestedContributionBase > 0
    ? { targetSlug: query.contributionTarget, baseRevision: requestedContributionBase, relatedIssueId: query.relatedIssue?.slice(0, 200) }
    : undefined;
  const session = await getSession();
  const base = await prisma.project.findUnique({
    where: { slug },
    include: { owner: { select: { name: true } } },
  });
  if (!base) notFound();

  if (!base.isPublic && session?.user.id !== base.ownerId) notFound();
  if (view === "new-issue") {
    if (!base.isPublic) notFound();
    if (!session) redirect(`/login?next=${encodeURIComponent(`/projects/${slug}/issues/new`)}`);
  }

  // Each view reads only its own collection, so Overview never loads the full
  // revision/release history or nested issue comments, proposals, and discussions.
  const needsLatestRevision = view === "overview" || view === "proposals" || view === "revisions";
  const revisionSelect = { id: true, number: true, title: true, changeDescription: true, tool: true, toolVersion: true, tags: true, sourceChecksum: true, sourceKey: true, capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true, createdAt: true, publishedBy: { select: { name: true } }, previews: { orderBy: { position: "asc" }, select: { id: true, position: true, url: true, mimeType: true, altText: true } }, appliedProposal: { select: { id: true, proposalNumber: true, author: { select: { name: true } } } }, appliedChanges: { select: { id: true } } } satisfies Prisma.RevisionSelect;
  const revisionHistorySelect = { id: true, number: true, title: true, changeDescription: true, tool: true, toolVersion: true, tags: true, capabilityMode: true, capabilityUnitCount: true, adapterId: true, adapterVersion: true, adapterConfidence: true, adapterMaturity: true, createdAt: true, publishedBy: { select: { name: true } } } satisfies Prisma.RevisionSelect;
  const releaseSelect = { id: true, number: true, title: true, description: true, createdAt: true, publishedBy: { select: { name: true } }, _count: { select: { revisions: true } } } satisfies Prisma.ReleaseSelect;
  const issueSelect = { id: true, title: true, kind: true, status: true, isOpenQuestion: true, createdAt: true, author: { select: { name: true } }, _count: { select: { comments: true } } } satisfies Prisma.IssueSelect;
  const discussionSelect = { id: true, title: true, createdAt: true, author: { select: { name: true } }, _count: { select: { comments: true } } } satisfies Prisma.DiscussionSelect;
  const forkSelect = { id: true, slug: true, title: true, description: true, license: true, createdAt: true, owner: { select: { name: true } } } satisfies Prisma.ProjectSelect;
  const cursorQuery: { cursor?: { id: string }; skip?: number } = cursor ? { cursor: { id: cursor }, skip: 1 } : {};
  const forkCursor = view === "forks" && cursor
    ? await prisma.project.findFirst({ where: { slug: cursor, forkedFromProjectId: base.id, isPublic: true }, select: { slug: true } })
    : null;
  const forkCursorQuery: { cursor?: { slug: string }; skip?: number } = forkCursor ? { cursor: { slug: forkCursor.slug }, skip: 1 } : {};
  let canvasVisibilityChanged = false;
  const canvasRowsPromise = view === "discussions" && base.isPublic
    ? readCanvasPage(slug, session?.user.id ?? null).catch(async (error) => {
      if (!(error instanceof PrivateProjectWrite)) throw error;
      canvasVisibilityChanged = true;
      const currentProject = await prisma.project.findUnique({ where: { slug }, select: { isPublic: true, ownerId: true } });
      if (!currentProject || (!currentProject.isPublic && session?.user.id !== currentProject.ownerId)) notFound();
      return { items: [], nextCursor: null };
    })
    : Promise.resolve({ items: [], nextCursor: null });
  const [revisionRows, latestRevisionRows, releaseRows, issueRows, discussionRows, forkRows, openIssueCount, revisionCount, openDesignRequests, openQuestions, canvasRows] = await Promise.all([
    view === "revisions"
      ? prisma.revision.findMany({ where: { projectId: base.id, isPublished: true }, orderBy: { number: "asc" }, ...cursorQuery, take: pageSize + 1, select: revisionHistorySelect })
      : view === "new-issue"
        ? prisma.revision.findMany({ where: { projectId: base.id, isPublished: true }, orderBy: { number: "asc" }, select: revisionSelect })
        : Promise.resolve([]),
    needsLatestRevision
      ? prisma.revision.findMany({ where: { projectId: base.id, isPublished: true }, orderBy: { number: "desc" }, take: 1, select: revisionSelect })
      : Promise.resolve([]),
    view === "releases"
      ? prisma.release.findMany({ where: { projectId: base.id }, orderBy: { number: "desc" }, ...cursorQuery, take: pageSize + 1, select: releaseSelect })
      : Promise.resolve([]),
    view === "issues"
      ? prisma.issue.findMany({ where: { projectId: base.id, status: issueStatus }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...cursorQuery, take: pageSize + 1, select: issueSelect })
      : Promise.resolve([]),
    view === "discussions"
      ? prisma.discussion.findMany({ where: { projectId: base.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...cursorQuery, take: pageSize + 1, select: discussionSelect })
      : Promise.resolve([]),
    view === "forks"
      ? prisma.project.findMany({ where: { forkedFromProjectId: base.id, isPublic: true }, orderBy: [{ createdAt: "desc" }, { slug: "desc" }], ...forkCursorQuery, take: pageSize + 1, select: forkSelect })
      : Promise.resolve([]),
    view === "overview"
      ? prisma.issue.count({ where: { projectId: base.id, status: "OPEN", kind: { not: "DESIGN_REQUEST" } } })
      : Promise.resolve(0),
    view === "overview"
      ? prisma.revision.count({ where: { projectId: base.id, isPublished: true } })
      : Promise.resolve(0),
    view === "overview"
      ? prisma.issue.findMany({ where: { projectId: base.id, status: "OPEN", kind: "DESIGN_REQUEST" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, title: true, author: { select: { name: true } } } })
      : Promise.resolve([]),
    view === "overview"
      ? prisma.issue.findMany({ where: { projectId: base.id, status: "OPEN", kind: "ISSUE", isOpenQuestion: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 3, select: { id: true, title: true, sourceDiscussionId: true, revision: { select: { number: true, isPublished: true } } } })
      : Promise.resolve([]),
    canvasRowsPromise,
  ]);
  const revisions = view === "new-issue" ? revisionRows : revisionRows.slice(0, pageSize);
  const releases = releaseRows.slice(0, pageSize);
  const issues = issueRows.slice(0, pageSize);
  const discussions = discussionRows.slice(0, pageSize);
  const forks = forkRows.slice(0, pageSize);
  const revisionNextCursor = view === "revisions" && revisionRows.length > pageSize ? revisions.at(-1)?.id ?? null : null;
  const releaseNextCursor = view === "releases" && releaseRows.length > pageSize ? releases.at(-1)?.id ?? null : null;
  const issueNextCursor = view === "issues" && issueRows.length > pageSize ? issues.at(-1)?.id ?? null : null;
  const discussionNextCursor = view === "discussions" && discussionRows.length > pageSize ? discussions.at(-1)?.id ?? null : null;
  const forkNextCursor = view === "forks" && forkRows.length > pageSize ? forks.at(-1)?.slug ?? null : null;
  const project = { ...base, revisions, releases, issues, discussions, forks };

  const proposalFilter = query.proposalStatus === "closed" ? "closed" : "open";
  const latestRevision = latestRevisionRows[0] ?? project.revisions.at(-1);
  const needsAttribution = view === "overview" || view === "contributors";
  const [proposalPage, activeProposalPage, activeProposalCount, attribution, latestProposal] = await Promise.all([
    view === "proposals" ? listVisibleProposalSummaries(project.id, session?.user.id, { status: proposalFilter, take: 20 }) : Promise.resolve({ items: [], nextCursor: null }),
    view === "overview" ? listVisibleProposalSummaries(project.id, session?.user.id, { status: "open", take: 3 }) : Promise.resolve({ items: [], nextCursor: null }),
    view === "overview" ? countVisibleProposals(project.id, session?.user.id, "open") : Promise.resolve(0),
    needsAttribution ? listProjectAttribution(project.id, session?.user.id) : Promise.resolve([]),
    view === "overview" && latestRevision?.appliedProposal ? findVisibleProposal(latestRevision.appliedProposal.id, session?.user.id) : Promise.resolve(null),
  ]);
  const activeProposals = activeProposalPage.items;
  const proposalRows: ProposalListItem[] = proposalPage.items;
  const latestFiles = view === "revisions" ? publicBundleFiles(await readRevisionBundle(latestRevision?.sourceKey)) : [];
  const latestPreview = latestRevision?.previews.find((preview) => preview.mimeType !== "text/html");
  const contributors = attribution.length;
  if (view === "settings" && session?.user.id !== project.ownerId) notFound();
  return <>
    {view === "overview" && <section aria-labelledby="overview-heading" className={styles.section} id="overview">
      <div className={styles.overviewGrid}>
        <figure className={styles.artwork} id="preview">
          <img alt={latestPreview?.altText ?? `${project.title} cover`} src={publicAssetUrl(latestPreview?.url ?? project.coverUrl)} />
          <figcaption>{latestRevision ? `Revision ${latestRevision.number}` : "Project cover"}</figcaption>
        </figure>
        <aside aria-label="Project information" className={styles.infoRail}>
          <ProjectAbout activityStatus={project.activityStatus} description={project.description} isOwner={session?.user.id === project.ownerId} license={project.license} slug={project.slug} title={project.title} />
          <dl className={styles.infoList}>
            <div><dt>License</dt><dd>{project.license}</dd></div>
            <div><dt>Owner</dt><dd>{project.owner.name}</dd></div>
            <div><dt>Contributions</dt><dd>{latestRevision ? <>Open from <Link href={`/projects/${project.slug}/revisions/${latestRevision.number}`}>Revision {latestRevision.number}</Link></> : "Publish a revision to open contributions."}</dd></div>
          </dl>
          <nav aria-label="Project next steps" className={styles.overviewNextActions}>
            {session?.user.id === project.ownerId
              ? !project.isPublic
                ? <Link className={styles.secondaryLink} href={`/projects/${slug}/settings`}>Manage private project</Link>
                : latestRevision
                  ? <Link className={styles.secondaryLink} href={`/projects/${slug}/issues/new`}>Open an issue or design request</Link>
                  : <Link className={styles.secondaryLink} href={`/projects/${slug}/revisions?publish=1#owner-tools`}>Publish the first revision</Link>
              : latestRevision
                ? <Link className={styles.secondaryLink} href={`/projects/${slug}/contribute`}>Contribute from the latest revision</Link>
                : <Link className={styles.secondaryLink} href={`/projects/${slug}/discussions`}>Explore project discussions</Link>}
            {project.isPublic && openDesignRequests.length > 0 && session?.user.id !== project.ownerId && <Link href={`/projects/${slug}/issues`}>Browse open issues and requests</Link>}
          </nav>
          <dl className={styles.metrics}>
            <div><dt>Contributors</dt><dd>{contributors}</dd></div>
            <div><dt>Revisions</dt><dd>{revisionCount}</dd></div>
            <div><dt>Open issues</dt><dd>{openIssueCount}</dd></div>
            <div><dt>Open proposals</dt><dd>{activeProposalCount}</dd></div>
          </dl>
          {!project.isPublic && session?.user.id === project.ownerId && <p className={styles.privateNote}>Private workspace visible to you.</p>}
          <section className={styles.activity} aria-labelledby="open-questions-heading">
            <header><h2 id="open-questions-heading">Open questions</h2><Link href={`/projects/${slug}/issues`}>View issues</Link></header>
            {openQuestions.length ? <div className={styles.activityList}>{openQuestions.map((question) => <article key={question.id}><div><Link href={`/projects/${slug}/issues/${question.id}`}>{question.title}</Link><p>Needs a design decision{question.sourceDiscussionId ? " · Linked discussion" : ""}{question.revision?.isPublished ? ` · Revision ${question.revision.number}` : ""}</p></div></article>)}</div> : <p className={styles.muted}>No open design questions have been selected.</p>}
          </section>
        </aside>
        {latestRevision && <section className={styles.latestRevision}>
          <p className={styles.eyebrow}>Current work</p><h2>Latest revision</h2>
          <ol className={styles.revisionList}><RevisionItem capability={<><CapabilityBadge adapterConfidence={latestRevision.adapterConfidence} adapterId={latestRevision.adapterId} adapterMaturity={latestRevision.adapterMaturity} adapterVersion={latestRevision.adapterVersion} mode={latestRevision.capabilityMode} unitCount={latestRevision.capabilityUnitCount} />{latestProposal ? <><p className={styles.revisionNote}>Applied {Math.max(1, latestRevision.appliedChanges.length)} changes from <Link href={`/proposals/${latestProposal.id}`}>Proposal #{latestProposal.proposalNumber}</Link> <span aria-hidden="true">·</span> Contributor {latestProposal.author.name}</p><p className={styles.revisionNote}>{latestProposal.changeSet?.changes.filter((change) => change.appliedRevisionId === latestRevision.id).slice(0, 2).map(changeSummary).join(" · ")}</p></> : undefined}</>} changeDescription={latestRevision.changeDescription} createdAt={latestRevision.createdAt} href={`/projects/${project.slug}/revisions/${latestRevision.number}`} id={latestRevision.id} key={latestRevision.id} number={latestRevision.number} publisher={latestRevision.publishedBy?.name} tags={latestRevision.tags} title={latestRevision.title} tool={latestRevision.tool} /></ol>
        </section>}
        <div className={styles.activityGrid}>
          <section className={styles.activity}>
            <header><h2>Looking for contributions</h2><Link href={`/projects/${slug}/issues`}>View issues</Link></header>
            {openDesignRequests.length ? <div className={styles.activityList}>{openDesignRequests.slice(0, 3).map((issue) => <article key={issue.id}><Link href={`/projects/${slug}/issues/${issue.id}`}>{issue.title}</Link><span>Opened by {issue.author.name}</span></article>)}</div> : <p className={styles.muted}>No open design requests.</p>}
          </section>
          <section className={styles.activity}>
            <header><h2>Active proposals</h2><Link href={`/projects/${slug}/proposals`}>View proposals</Link></header>
            {activeProposals.length ? <div className={styles.activityList}>{activeProposals.map((proposal) => {
              const presentation = proposalStatusPresentation(proposal.status, proposal.applied, proposal.total);
              return <article key={proposal.id}><div><Link href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} <span aria-hidden="true">·</span> {proposal.title}</Link><p>Approved {proposal.approved}/{proposal.total}{proposal.applied ? ` · Applied ${proposal.applied}/${proposal.total}` : ""}</p>{proposal.summaries.length > 0 && <p>{proposal.summaries.join(" · ")}{proposal.moreChanges ? ` · ${proposal.moreChanges} more changes` : ""}</p>}</div><StatusBadge icon={presentation.icon} tone={presentation.tone}>{presentation.label}</StatusBadge><CapabilityBadge adapterConfidence={proposal.capability.adapterConfidence} adapterId={proposal.capability.adapterId} adapterMaturity={proposal.capability.adapterMaturity} adapterVersion={proposal.capability.adapterVersion} mode={proposal.capability.mode} unitCount={proposal.capability.unitCount} /></article>;
            })}</div> : <p className={styles.muted}>No active proposals yet.</p>}
          </section>
        </div>
        <ProjectDocument document={project.document ?? ""} hasRevision={Boolean(latestRevision)} isOwner={session?.user.id === project.ownerId} slug={project.slug} />
      </div>
    </section>}

    {view === "revisions" && session?.user.id === project.ownerId && <>
      {contributionReturn && <Banner title="Prepare your working revision" tone="info">Edit the source in an external design tool, then publish a new revision here. Publishing returns to the target contribution workspace.</Banner>}
      <details className={styles.ownerTools} id="owner-tools" open={Boolean(contributionReturn) || query.publish === "1"}><summary>Publish revision</summary><div><PageGrid><FormColumn><RevisionPublishForm contributionReturn={contributionReturn} existingFiles={latestFiles} slug={project.slug} /></FormColumn></PageGrid></div></details>
    </>}
    {view === "settings" && <section aria-labelledby="settings-heading" className={styles.section}><h2 id="settings-heading">Project settings</h2><PageGrid><FormColumn><ProjectSettingsForm activityStatus={project.activityStatus} description={project.description} isPublic={project.isPublic} key={JSON.stringify([project.title, project.description, project.license, project.activityStatus, project.isPublic])} license={project.license} slug={project.slug} title={project.title} /></FormColumn></PageGrid></section>}

    {view === "revisions" && <section aria-labelledby="revision-history" className={styles.section} id="revisions">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>History</p><h2 id="revision-history">Revisions</h2></div><span>Commit history</span></header>
      {project.revisions.length ? <ol className={styles.revisionList}>{project.revisions.map((revision) => <RevisionItem capability={<CapabilityBadge adapterConfidence={revision.adapterConfidence} adapterId={revision.adapterId} adapterMaturity={revision.adapterMaturity} adapterVersion={revision.adapterVersion} mode={revision.capabilityMode} unitCount={revision.capabilityUnitCount} />} changeDescription={revision.changeDescription} createdAt={revision.createdAt} href={`/projects/${project.slug}/revisions/${revision.number}`} id={revision.id} key={revision.id} number={revision.number} publisher={revision.publishedBy?.name} tags={revision.tags} title={revision.title} tool={revision.tool ? `${revision.tool}${revision.toolVersion ? ` ${revision.toolVersion}` : ""}` : null} />)}</ol> : <p className={styles.muted}>No revisions published yet.</p>}
      <ProjectListPagination cursor={cursor} label="Revision" nextCursor={revisionNextCursor} pageSize={pageSize} slug={project.slug} view="revisions" />
    </section>}

    {view === "releases" && <section aria-labelledby="releases-heading" className={styles.section} id="releases">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>History</p><h2 id="releases-heading">Releases</h2></div>{session?.user.id === project.ownerId && <Link className={styles.secondaryLink} href={`/projects/${project.slug}/releases/new`}>Publish release</Link>}</header>
      {project.releases.length ? <ul className={styles.releaseList}>{project.releases.map((release) => <li key={release.id}>
        <Link className={styles.releaseRowLink} href={`/projects/${project.slug}/releases/${release.number}`}>
          <strong>Release {release.number} <span aria-hidden="true">·</span> {release.title}</strong>
          <span>{release._count.revisions} {release._count.revisions === 1 ? "revision" : "revisions"} <span aria-hidden="true">·</span> <time dateTime={release.createdAt.toISOString()}>{release.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></span>
        </Link>
      </li>)}</ul> : <p className={styles.muted}>No releases yet.</p>}
      <ProjectListPagination cursor={cursor} label="Release" nextCursor={releaseNextCursor} pageSize={pageSize} slug={project.slug} view="releases" />
    </section>}

    {view === "discussions" && <section aria-labelledby="discussions-heading" className={`${styles.section} ${styles.discussionSection}`} id="discussions">
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
      <ProjectListPagination cursor={cursor} label="Discussion" nextCursor={discussionNextCursor} pageSize={pageSize} slug={project.slug} view="discussions" />
      {project.isPublic && !canvasVisibilityChanged && <CanvasMembership canvases={canvasRows.items.map((canvas) => canvasView(canvas, session?.user.id ?? null))} embedded isProjectOwner={session?.user.id === project.ownerId} nextCursor={canvasRows.nextCursor} signedIn={Boolean(session)} slug={slug} />}
    </section>}

    {view === "issues" && <section aria-labelledby="issues-heading" className={styles.section} id="issues">
      <header className={styles.sectionHeader}><h2 id="issues-heading">Issues</h2>{project.isPublic && <Link className={styles.secondaryLink} href={`/projects/${slug}/issues/new`}>New issue</Link>}</header>
      <RouteNav currentHref={`/projects/${slug}/issues?issueStatus=${query.issueStatus === "closed" ? "closed" : "open"}`} items={[{ href: `/projects/${slug}/issues?issueStatus=open`, label: "Open" }, { href: `/projects/${slug}/issues?issueStatus=closed`, label: "Closed" }]} label="Issue status" />
      {project.issues.length ? <ul className={styles.discussionList}>{project.issues.map((issue) => <li id={`issue-${issue.id}`} key={issue.id}><Link className={styles.discussionRowLink} href={`/projects/${slug}/issues/${issue.id}${query.issueStatus === "closed" ? "?issueStatus=closed" : ""}`}><strong>{issue.title}</strong><span>{issue.kind === "DESIGN_REQUEST" ? "Design request" : "Issue"}{issue.isOpenQuestion ? issue.status === "OPEN" ? " · Open question" : " · Resolved question" : ""} · {issue.status === "OPEN" ? "Open" : "Closed"} · Opened by {issue.author.name} · {issue._count.comments} comments</span></Link></li>)}</ul> : <p className={styles.muted}>No {query.issueStatus === "closed" ? "closed" : "open"} issues.</p>}
      <ProjectListPagination cursor={cursor} issueStatus={query.issueStatus === "closed" ? "closed" : "open"} label="Issue" nextCursor={issueNextCursor} pageSize={pageSize} slug={project.slug} view="issues" />
    </section>}
    {view === "new-issue" && <section className={styles.section}><h2>New issue</h2><Link className={styles.secondaryLink} href={`/projects/${slug}/issues`}>Back to issues</Link><IssueBoard canManage={session?.user.id === project.ownerId} issues={[]} mode="create" revisions={project.revisions} signedIn slug={slug} /></section>}
    {view === "proposals" && <section aria-labelledby="proposals-heading" className={styles.section} id="proposals">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Collaboration</p><h2 id="proposals-heading">Proposals</h2></div>{session && latestRevision && <Link className={styles.secondaryLink} href={`/projects/${project.slug}/contribute`}>New proposal</Link>}</header>
      <ProposalList initialCursor={proposalPage.nextCursor} initialFilter={proposalFilter} initialItems={proposalRows} slug={project.slug} />
    </section>}
    {view === "contributors" && <section aria-labelledby="contributors-heading" className={styles.section} id="contributors">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Collaboration</p><h2 id="contributors-heading">Contributors</h2></div><span>{contributors} people</span></header>
      <ul className={styles.contributorList}>{attribution.map((person) => <li key={person.id}><div><strong>{person.name}</strong><div className={styles.contributorRoles}>{person.roles.map((role) => <Badge key={role}>{roleLabel(role)}</Badge>)}</div></div><span>{attributionMetrics(person).join(" · ")}</span></li>)}</ul>
    </section>}
    {view === "forks" && <section aria-labelledby="forks-heading" className={styles.section} id="forks">
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Lineage</p><h2 id="forks-heading">Forks</h2></div><span>Project descendants</span></header>
      {project.forks.length ? <ul className={styles.forkList}>{project.forks.map((fork) => <li key={fork.id}><Link href={`/projects/${fork.slug}`}>{fork.title}</Link>{fork.description && <p>{fork.description}</p>}<span>{fork.owner.name} <span aria-hidden="true">·</span> {fork.license} <span aria-hidden="true">·</span> Created <time dateTime={fork.createdAt.toISOString()}>{formatDate(fork.createdAt)}</time></span></li>)}</ul> : <p className={styles.muted}>No forks yet.</p>}
      <ProjectListPagination cursor={forkCursor?.slug} label="Fork" nextCursor={forkNextCursor} pageSize={pageSize} slug={project.slug} view="forks" />
    </section>}
        {view === "overview" && project.isPublic && <details className={styles.ownerTools}><summary>Report project</summary><PageGrid><FormColumn><ReportForm projectSlug={project.slug} /></FormColumn></PageGrid></details>}
  </>;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function ProjectListPagination({ slug, view, label, pageSize, cursor, nextCursor, issueStatus }: { slug: string; view: "revisions" | "releases" | "issues" | "discussions" | "forks"; label: string; pageSize: number; cursor?: string; nextCursor: string | null; issueStatus?: "open" | "closed" }) {
  if (!cursor && !nextCursor) return null;
  const href = (next: string | null) => {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (next) params.set("cursor", next);
    if (view === "issues" && issueStatus) params.set("issueStatus", issueStatus);
    return `/projects/${slug}/${view}?${params.toString()}`;
  };
  return <nav aria-label={`${label} pages`} className={styles.pagePagination}>
    {cursor && <Link className={styles.secondaryLink} href={href(null)}>First page</Link>}
    {nextCursor && <Link className={styles.secondaryLink} href={href(nextCursor)}>Next page</Link>}
  </nav>;
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
