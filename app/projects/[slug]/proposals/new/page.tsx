import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FormColumn, PageGrid, PageHeader, Panel } from "@/src/components/ui/layout";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { publicBundleFiles, readRevisionBundle } from "@/src/lib/revision-bundle";
import ProposalForm from "./proposal-form";
import { parseInitialChanges } from "./proposal-helpers";

export const dynamic = "force-dynamic";

export default async function NewProposalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ baseRevision?: string; sourceProject?: string; sourceRevision?: string; changes?: string; relatedIssue?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const session = await getSession();
  if (!session) {
    const context = new URLSearchParams();
    for (const key of ["baseRevision", "sourceProject", "sourceRevision", "changes", "relatedIssue"] as const) {
      if (query[key]) context.set(key, query[key]);
    }
    redirect(`/login?next=${encodeURIComponent(`/projects/${slug}/proposals/new${context.size ? `?${context}` : ""}`)}`);
  }
  const project = await prisma.project.findUnique({ where: { slug }, include: { revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceKey: true, sourceUrl: true, capabilityMode: true, capabilityUnitCount: true } }, issues: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, kind: true } } } });
  if (!project || (!project.isPublic && project.ownerId !== session.user.id)) notFound();
  const requestedBase = Number(query.baseRevision);
  const baseRevision = Number.isInteger(requestedBase) && requestedBase > 0 ? project.revisions.find((revision) => revision.number === requestedBase) : project.revisions[0];
  if (!baseRevision) notFound();
  const workspaces = await prisma.project.findMany({ where: { ownerId: session.user.id }, orderBy: { createdAt: "desc" }, select: { slug: true, title: true, revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceKey: true, sourceUrl: true, capabilityMode: true, capabilityUnitCount: true } } } });
  const [baseFiles, sourceRevisions] = await Promise.all([
    readRevisionBundle(baseRevision.sourceKey).then(publicBundleFiles),
    Promise.all(workspaces.flatMap((workspace) => workspace.revisions.map(async (revision) => ({ ...revision, projectSlug: workspace.slug, projectTitle: workspace.title, files: publicBundleFiles(await readRevisionBundle(revision.sourceKey)) })))).then((revisions) => revisions),
  ]);
  const preferred = sourceRevisions.find((revision) => revision.projectSlug === query.sourceProject && String(revision.number) === query.sourceRevision);
  const initialChanges = preferred ? parseInitialChanges(query.changes) : [];
  const defaultRelatedIssueId = project.issues.some((issue) => issue.id === query.relatedIssue) ? query.relatedIssue : "";
  return <PageGrid aria-labelledby="new-proposal-heading">
    <FormColumn>
      <article className="detail proposal-page">
        <p className="meta"><Link href={`/projects/${slug}`}>{project.title}</Link> · Proposal</p>
        <PageHeader id="new-proposal-heading" title="Propose changes" description={`Create a focused proposal against Revision ${baseRevision.number}.`} />
        {sourceRevisions.length ? <Panel><ProposalForm baseRevision={{ ...baseRevision, files: baseFiles }} defaultRelatedIssueId={defaultRelatedIssueId} defaultSourceRevisionId={preferred?.id ?? sourceRevisions[0].id} initialChanges={initialChanges} relatedIssues={project.issues} slug={slug} sourceRevisions={sourceRevisions} /></Panel> : <p className="empty-state">Publish a revision in one of your projects before proposing changes.</p>}
      </article>
    </FormColumn>
  </PageGrid>;
}
