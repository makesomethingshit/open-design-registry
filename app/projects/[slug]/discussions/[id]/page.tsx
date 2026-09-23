import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { PageGrid, PageHeader, Panel, Stack, WideColumn } from "@/src/components/ui/layout";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { DiscussionCommentForm } from "../../discussion-forms";
import styles from "../../project.module.css";

export const dynamic = "force-dynamic";

export default async function DiscussionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const session = await getSession();
  const discussion = await prisma.discussion.findFirst({
    where: { id, project: { slug } },
    include: {
      project: { select: { slug: true, title: true, ownerId: true, isPublic: true } },
      author: { select: { name: true } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!discussion || (!discussion.project.isPublic && discussion.project.ownerId !== session?.user.id)) notFound();

  const detailHref = `/projects/${slug}/discussions/${id}`;
  return <PageGrid aria-labelledby="discussion-heading">
    <WideColumn className={styles.discussionDetailPage}>
      <Stack gap={4}>
        <Link className={styles.secondaryLink} href={`/projects/${slug}#discussions`}>← {discussion.project.title}</Link>
        <PageHeader eyebrow="DISCUSSION" id="discussion-heading" title={discussion.title} />
        <p className={styles.discussionMeta}>{discussion.author.name} <span aria-hidden="true">·</span> <time dateTime={discussion.createdAt.toISOString()}>{formatDate(discussion.createdAt)}</time></p>
        {discussion.body && <Panel className={styles.discussionBodyPanel}><p className={styles.discussionBody}>{discussion.body}</p></Panel>}
        <Panel>
          <Stack gap={4}>
            <header className={styles.sectionHeader}><h2 id="comments-heading">Comments</h2><span>{discussion.comments.length} {discussion.comments.length === 1 ? "comment" : "comments"} · oldest first</span></header>
            {discussion.comments.length ? <ol aria-labelledby="comments-heading" className={styles.discussionComments}>{discussion.comments.map((comment) => <li key={comment.id}>
              <p className={styles.discussionMeta}>{comment.author.name} <span aria-hidden="true">·</span> <time dateTime={comment.createdAt.toISOString()}>{formatDate(comment.createdAt)}</time></p>
              <p className={styles.discussionCommentBody}>{comment.body}</p>
            </li>)}</ol> : <p className="meta">No comments yet.</p>}
            {discussion.project.isPublic && (session
              ? <DiscussionCommentForm discussionId={discussion.id} slug={slug} />
              : <Banner title="Sign in to add a comment" tone="info"><Link href={`/login?next=${encodeURIComponent(detailHref)}`}>Continue to sign in</Link></Banner>)}
          </Stack>
        </Panel>
      </Stack>
    </WideColumn>
  </PageGrid>;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { dateStyle: "medium" });
}
