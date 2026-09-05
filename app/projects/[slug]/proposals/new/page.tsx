import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { publicBundleFiles, readRevisionBundle } from "@/src/lib/revision-bundle";
import ProposalForm from "./proposal-form";

export const dynamic = "force-dynamic";

export default async function NewProposalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ baseRevision?: string; sourceProject?: string; sourceRevision?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/projects/${slug}/proposals/new`)}`);
  const project = await prisma.project.findUnique({ where: { slug }, include: { revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceKey: true } }, issues: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } } } });
  if (!project || (!project.isPublic && project.ownerId !== session.user.id)) notFound();
  const requestedBase = Number(query.baseRevision);
  const baseRevision = Number.isInteger(requestedBase) && requestedBase > 0 ? project.revisions.find((revision) => revision.number === requestedBase) : project.revisions[0];
  if (!baseRevision) notFound();
  const workspaces = await prisma.project.findMany({ where: { ownerId: session.user.id }, orderBy: { createdAt: "desc" }, select: { slug: true, title: true, revisions: { where: { isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceKey: true } } } });
  const [baseFiles, sourceRevisions] = await Promise.all([
    readRevisionBundle(baseRevision.sourceKey).then(publicBundleFiles),
    Promise.all(workspaces.flatMap((workspace) => workspace.revisions.map(async (revision) => ({ ...revision, projectSlug: workspace.slug, projectTitle: workspace.title, files: publicBundleFiles(await readRevisionBundle(revision.sourceKey)) })))).then((revisions) => revisions),
  ]);
  const preferred = sourceRevisions.find((revision) => revision.projectSlug === query.sourceProject && String(revision.number) === query.sourceRevision);
  return <article className="detail proposal-page">
    <p className="meta"><Link href={`/projects/${slug}`}>{project.title}</Link> · Proposal</p>
    <h1>Propose changes</h1>
    {sourceRevisions.length ? <ProposalForm slug={slug} baseRevision={{ ...baseRevision, files: baseFiles }} sourceRevisions={sourceRevisions} relatedIssues={project.issues} defaultSourceRevisionId={preferred?.id ?? sourceRevisions[0].id} /> : <p className="empty-state">Publish a revision in one of your projects before proposing changes.</p>}
  </article>;
}
