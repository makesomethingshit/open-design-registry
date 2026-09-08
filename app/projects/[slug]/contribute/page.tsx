import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { revisionUrlSchema } from "@/src/lib/project-validation";
import { getSession } from "@/src/lib/session";
import ContributionWorkspace from "./contribution-workspace";

export const dynamic = "force-dynamic";

export default async function ContributionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      ownerId: true,
      isPublic: true,
      slug: true,
      title: true,
      owner: { select: { name: true } },
      revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true } },
      issues: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } },
    },
  });
  if (!project || (!project.isPublic && project.ownerId !== session?.user.id)) notFound();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/projects/${slug}/contribute`)}`);

  const sourceProjects = await prisma.project.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      slug: true,
      title: true,
      owner: { select: { name: true } },
      revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceUrl: true, tool: true } },
    },
  });

  return <ContributionWorkspace
    baseRevisions={project.revisions}
    project={{ slug: project.slug, title: project.title, owner: project.owner.name }}
    relatedIssues={project.issues}
    sourceRevisions={sourceProjects.flatMap((sourceProject) => sourceProject.revisions.map((revision) => ({
      ...revision,
      projectSlug: sourceProject.slug,
      projectTitle: sourceProject.title,
      owner: sourceProject.owner.name,
      sourceUrl: revision.sourceUrl && revisionUrlSchema.safeParse(revision.sourceUrl).success ? revision.sourceUrl : null,
    })))}
  />;
}
