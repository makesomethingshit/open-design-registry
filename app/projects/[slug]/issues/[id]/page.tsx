import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/src/components/ui/badge";
import { TextLink } from "@/src/components/ui/button";
import { Inline, PageGrid, PageHeader, Panel, SectionHeader, Stack, WideColumn } from "@/src/components/ui/layout";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import styles from "../../project.module.css";

export const dynamic = "force-dynamic";

export default async function IssuePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await getSession();
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
    },
  });
  if (!issue || (!issue.project.isPublic && issue.project.ownerId !== session?.user.id)) notFound();

  const isRequest = issue.kind === "DESIGN_REQUEST";
  const isOpen = issue.status === "OPEN";
  const heading = isRequest ? "Design request" : "Issue";

  return <PageGrid aria-labelledby="issue-heading">
    <WideColumn className={styles.discussionDetailPage}>
      <Stack gap={4}>
        <Link className={styles.secondaryLink} href={`/projects/${slug}#issues`}>← {issue.project.title}</Link>
        <PageHeader eyebrow={heading} id="issue-heading" title={issue.title} />
        <Inline gap={2}><StatusBadge tone={isOpen ? "success" : "neutral"}>{isOpen ? "Open" : "Closed"}</StatusBadge></Inline>
        <p className={styles.discussionMeta}>Opened by {issue.author.name} <span aria-hidden="true">·</span> <time dateTime={issue.createdAt.toISOString()}>{formatDate(issue.createdAt)}</time></p>
        <Panel aria-labelledby="issue-description-heading" className={styles.discussionBodyPanel}>
          <Stack gap={3}>
            <SectionHeader id="issue-description-heading" title="Details" />
            <p className={styles.discussionBody}>{issue.body || "No description was provided."}</p>
          </Stack>
        </Panel>
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
