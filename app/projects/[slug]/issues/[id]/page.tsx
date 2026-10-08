import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/src/components/ui/badge";
import { TextLink } from "@/src/components/ui/button";
import { Inline, PageGrid, PageHeader, Panel, SectionHeader, Stack, WideColumn } from "@/src/components/ui/layout";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { isVisible } from "@/src/lib/proposal-handlers";
import ParticipationControl from "./participation-control";
import IssueBoard from "../../issue-board";
import styles from "../../project.module.css";

export const dynamic = "force-dynamic";

export default async function IssuePage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams?: Promise<{ issueStatus?: string }> }) {
  const { slug, id } = await params;
  const session = await getSession();
  const query = await searchParams;
  const listSearch = query?.issueStatus === "closed" ? "?issueStatus=closed" : "";
  const issue = await prisma.issue.findFirst({
    where: { id, project: { slug } },
    select: {
      id: true,
      title: true,
      body: true,
      kind: true,
      status: true,
      createdAt: true,
      author: { select: { name: true } },
      project: { select: { title: true, ownerId: true, isPublic: true } },
      revision: { select: { number: true, isPublished: true } },
      comments: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, author: { select: { name: true } } } },
      proposals: { orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, proposalNumber: true, title: true, status: true, project: { select: { id: true, ownerId: true, isPublic: true } }, baseRevision: { select: { projectId: true, isPublished: true } }, sourceRevision: { select: { isPublished: true, project: { select: { ownerId: true, isPublic: true } } } }, appliedRevisions: { where: { isPublished: true }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } } } },
    },
  });
  if (!issue || (!issue.project.isPublic && issue.project.ownerId !== session?.user.id)) notFound();

  const isRequest = issue.kind === "DESIGN_REQUEST";
  const isOpen = issue.status === "OPEN";
  const participation = isRequest && issue.project.isPublic && isOpen
    ? await Promise.all([
      prisma.designRequestParticipation.count({ where: { issueId: issue.id } }),
      prisma.designRequestParticipation.findMany({ where: { issueId: issue.id }, orderBy: [{ createdAt: "asc" }, { userId: "asc" }], take: 5, select: { user: { select: { name: true } } } }),
      session ? prisma.designRequestParticipation.findUnique({ where: { issueId_userId: { issueId: issue.id, userId: session.user.id } }, select: { issueId: true } }) : Promise.resolve(null),
    ])
    : [0, [], null] as const;
  const heading = isRequest ? "Design request" : "Issue";

  return <PageGrid aria-labelledby="issue-heading">
    <WideColumn className={styles.discussionDetailPage}>
      <Stack gap={4}>
        <Link aria-label="Back to issues" className={styles.secondaryLink} href={`/projects/${slug}/issues${listSearch}`}>← Issues</Link>
        <PageHeader eyebrow={heading} id="issue-heading" title={issue.title} />
        <Inline gap={2}><StatusBadge tone={isOpen ? "success" : "neutral"}>{isOpen ? "Open" : "Closed"}</StatusBadge></Inline>
        <p className={styles.discussionMeta}>Opened by {issue.author.name} <span aria-hidden="true">·</span> <time dateTime={issue.createdAt.toISOString()}>{formatDate(issue.createdAt)}</time></p>
        {isRequest && issue.project.isPublic && isOpen && <ParticipationControl issueId={issue.id} count={participation[0]} names={participation[1].map(({ user }) => user.name)} participating={Boolean(participation[2])} signedIn={Boolean(session)} loginHref={`/login?next=${encodeURIComponent(`/projects/${slug}/issues/${issue.id}`)}`} />}
        <Panel aria-labelledby="issue-description-heading" className={styles.discussionBodyPanel}>
          <Stack gap={3}>
            <SectionHeader id="issue-description-heading" title="Details" />
            <p className={styles.discussionBody}>{issue.body || "No description was provided."}</p>
          </Stack>
        </Panel>
        <IssueBoard canManage={issue.project.isPublic && session?.user.id === issue.project.ownerId} issues={[{ ...issue, comments: issue.comments ?? [], proposals: (issue.proposals ?? []).filter((proposal) => isVisible(proposal, session?.user.id)).map(({ id, proposalNumber, title, status, appliedRevisions }) => ({ id, proposalNumber, title, status, appliedRevisions })) }]} mode="conversation" revisions={[]} signedIn={issue.project.isPublic && Boolean(session)} slug={slug} />
        <Panel aria-labelledby="issue-context-heading">
          <Stack gap={3}>
            <SectionHeader id="issue-context-heading" title="Request context" />
            <dl className={styles.infoList}>
              <div><dt>Project</dt><dd><Link href={`/projects/${slug}`}>{issue.project.title}</Link></dd></div>
              <div><dt>Related revision</dt><dd>{issue.revision ? issue.revision.isPublished ? <Link href={`/projects/${slug}/revisions/${issue.revision.number}`}>Revision {issue.revision.number}</Link> : `Revision ${issue.revision.number}` : "None"}</dd></div>
            </dl>
            {isOpen && <>
              <SectionHeader title="Before you contribute" />
              <p>A Fork creates your own public work project. Edit its source in your design tool, then publish a Revision: a permanent record of your updated work.</p>
              <p>A Proposal sends those changes to the original project owner for review. The original stays unchanged until the owner applies them.</p>
              <p className="meta">Already have a changed Revision in a project you own? Select it in Contribute; another Fork is optional. This {isRequest ? "Design request" : "Issue"} stays linked through sign-in and submission.</p>
              <TextLink href={`/projects/${slug}/contribute?relatedIssue=${encodeURIComponent(issue.id)}`}>Contribute to this {isRequest ? "request" : "issue"}</TextLink>
            </>}
          </Stack>
        </Panel>
      </Stack>
    </WideColumn>
  </PageGrid>;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { dateStyle: "medium" });
}
