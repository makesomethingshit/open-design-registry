import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageGrid, PageHeader, Panel, Stack, WideColumn } from "@/src/components/ui/layout";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { DiscussionCreateForm } from "../../discussion-forms";
import styles from "../../project.module.css";

export const dynamic = "force-dynamic";

export default async function NewDiscussionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { title: true, isPublic: true } });
  if (!project?.isPublic) notFound();

  const next = `/projects/${slug}/discussions/new`;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);

  return <PageGrid aria-labelledby="new-discussion-heading">
    <WideColumn className={styles.discussionCreatePage}>
      <Stack gap={5}>
        <Link className={styles.secondaryLink} href={`/projects/${slug}/discussions`}>← {project.title}</Link>
        <PageHeader description="Share an idea or question about this project." id="new-discussion-heading" title="Start a discussion" />
        <Panel><DiscussionCreateForm slug={slug} /></Panel>
      </Stack>
    </WideColumn>
  </PageGrid>;
}
