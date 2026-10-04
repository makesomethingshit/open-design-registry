import { notFound, redirect } from "next/navigation";
import { TextLink } from "@/src/components/ui/button";
import { PageGrid, PageHeader, Panel, Stack, WideColumn } from "@/src/components/ui/layout";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import ReleaseForm from "./release-form";

export const dynamic = "force-dynamic";

export default async function NewReleasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const next = `/projects/${slug}/releases/new`;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);

  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, slug: true, title: true, ownerId: true } });
  if (!project || project.ownerId !== session.user.id) notFound();

  const revisions = await prisma.revision.findMany({
    where: { projectId: project.id, isPublished: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, title: true },
  });

  return <PageGrid aria-labelledby="new-release-heading">
    <WideColumn>
      <Stack gap={5}>
        <TextLink href={`/projects/${slug}/releases`}>{project.title}</TextLink>
        <PageHeader description="Group published revisions into a meaningful design release." id="new-release-heading" title="Publish release" />
        <Panel><ReleaseForm revisions={revisions} slug={slug} /></Panel>
      </Stack>
    </WideColumn>
  </PageGrid>;
}
