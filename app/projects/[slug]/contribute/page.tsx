import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { revisionUrlSchema } from "@/src/lib/project-validation";
import { getSession } from "@/src/lib/session";
import ContributionWorkspace from "./contribution-workspace";

export const dynamic = "force-dynamic";

export default async function ContributionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ baseRevision?: string; sourceProject?: string; sourceRevision?: string; relatedIssue?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
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
      issues: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, kind: true } },
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
      forkedFromProjectId: true,
      forkedFromRevisionId: true,
      owner: { select: { name: true } },
      revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceUrl: true, tool: true } },
    },
  });
  const sourceRevisions = sourceProjects.flatMap((sourceProject) => sourceProject.revisions.map((revision) => ({
    ...revision,
    projectSlug: sourceProject.slug,
    projectTitle: sourceProject.title,
    owner: sourceProject.owner.name,
    sourceUrl: revision.sourceUrl && revisionUrlSchema.safeParse(revision.sourceUrl).success ? revision.sourceUrl : null,
    projectForkedFromProjectId: sourceProject.forkedFromProjectId,
    projectForkedFromRevisionId: sourceProject.forkedFromRevisionId,
  })));
  const requestedBase = Number(query.baseRevision);
  const initialBaseRevisionId = project.revisions.find((revision) => revision.number === requestedBase)?.id;
  const initialSourceRevisionId = sourceRevisions.find((revision) => revision.projectSlug === query.sourceProject && String(revision.number) === query.sourceRevision)?.id;
  const initialRelatedIssueId = query.relatedIssue === undefined ? undefined : project.issues.some((issue) => issue.id === query.relatedIssue) ? query.relatedIssue : "";

  return <ContributionWorkspace
    baseRevisions={project.revisions}
    initialBaseRevisionId={initialBaseRevisionId}
    initialRelatedIssueId={initialRelatedIssueId}
    initialSourceRevisionId={initialSourceRevisionId}
    project={{ id: project.id, slug: project.slug, title: project.title, owner: project.owner.name }}
    relatedIssues={project.issues}
    sourceRevisions={sourceRevisions}
  />;
}
