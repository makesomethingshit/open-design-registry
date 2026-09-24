import { notFound } from "next/navigation";
import { RevisionItem } from "@/src/components/design/revision-item";
import { TextLink } from "@/src/components/ui/button";
import { PageGrid, PageHeader, Panel, Stack, WideColumn } from "@/src/components/ui/layout";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import styles from "../../project.module.css";

export const dynamic = "force-dynamic";

export default async function ReleasePage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const releaseNumber = Number(number);
  if (!Number.isInteger(releaseNumber) || releaseNumber < 1) notFound();

  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, slug: true, title: true, ownerId: true, isPublic: true } });
  if (!project) notFound();
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();

  const release = await prisma.release.findUnique({
    where: { projectId_number: { projectId: project.id, number: releaseNumber } },
    select: {
      number: true,
      title: true,
      description: true,
      createdAt: true,
      publishedBy: { select: { name: true } },
      revisions: {
        orderBy: { position: "asc" },
        select: { position: true, revision: { select: { id: true, number: true, title: true, changeDescription: true, createdAt: true, publishedBy: { select: { name: true } } } } },
      },
    },
  });
  if (!release) notFound();

  return <PageGrid aria-labelledby="release-heading">
    <WideColumn>
      <Stack gap={5}>
        <TextLink href={`/projects/${project.slug}`}>← {project.title}</TextLink>
        <PageHeader description={release.description || undefined} eyebrow={`Release ${release.number}`} id="release-heading" title={release.title} />
        <p className={styles.releaseMeta}>{release.publishedBy?.name ? `Published by ${release.publishedBy.name} · ` : "Published "}<time dateTime={release.createdAt.toISOString()}>{release.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</time></p>
        <Panel>
          <section aria-labelledby="included-revisions-heading">
            <h2 id="included-revisions-heading">Included revisions</h2>
            {release.revisions.length ? <ol className={styles.revisionList}>{release.revisions.map(({ revision }) => <RevisionItem
              changeDescription={revision.changeDescription}
              createdAt={revision.createdAt}
              href={`/projects/${project.slug}/revisions/${revision.number}`}
              id={revision.id}
              key={revision.id}
              number={revision.number}
              publisher={revision.publishedBy?.name}
              tags={[]}
              title={revision.title}
            />)}</ol> : <p className={styles.muted}>No revisions are included.</p>}
          </section>
        </Panel>
      </Stack>
    </WideColumn>
  </PageGrid>;
}
