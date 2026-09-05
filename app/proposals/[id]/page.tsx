import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { findVisibleProposal } from "@/src/lib/proposal-handlers";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import ProposalReview from "./proposal-review";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const proposal = await findVisibleProposal(id, session?.user.id);
  if (!proposal) notFound();
  const latest = await prisma.revision.findFirst({ where: { projectId: proposal.project.id, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, url: true, mimeType: true, altText: true } } } });
  const toRevision = (revision: { id: string; number: number; title: string; previews: Array<{ id: string; position: number; url: string; mimeType: string; altText: string }> }) => ({ ...revision, previews: revision.previews.filter((preview) => preview.mimeType !== "text/html").map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) })) });
  const baseRevision = toRevision(proposal.baseRevision);
  const sourceRevision = toRevision(proposal.sourceRevision);
  const latestRevision = latest ? toRevision(latest) : null;
  const stale = Boolean(latest && latest.id !== proposal.baseRevisionId);
  const isOwner = session?.user.id === proposal.project.ownerId;
  const canClose = Boolean(session && (isOwner || session.user.id === proposal.authorId));
  return <article className="detail proposal-page">
    <p className="meta"><Link href={`/projects/${proposal.project.slug}`}>{proposal.project.title}</Link> · Proposal</p>
    <div className="proposal-heading"><h1>{proposal.title}</h1><span className={`proposal-status ${proposal.status.toLowerCase()}`}>{proposal.status.replaceAll("_", " ")}</span></div>
    <p className="meta">{proposal.author.name} proposes {proposal.sourceRevision.project.title} Revision {proposal.sourceRevision.number} → {proposal.project.title} Revision {proposal.baseRevision.number}</p>
    <p className="proposal-body">{proposal.body}</p>
    {proposal.relatedIssue && <p className="meta">Related issue: {proposal.relatedIssue.title}</p>}
    {proposal.appliedRevision && <p className="success-note">Applied 1 change as <Link href={`/projects/${proposal.project.slug}/revisions/${proposal.appliedRevision.number}`}>Revision {proposal.appliedRevision.number}</Link>.</p>}
    <ProposalReview proposalId={proposal.id} baseRevision={baseRevision} sourceRevision={sourceRevision} latestRevision={latestRevision} stale={stale} status={proposal.status} changes={proposal.changeSet?.changes.map((change) => ({ id: change.id, reviewStatus: change.reviewStatus, reviewComment: change.reviewComment, reviewedBy: change.reviewedBy && { name: change.reviewedBy.name } })) ?? []} comments={proposal.comments} signedIn={Boolean(session)} isOwner={isOwner} canClose={canClose} />
  </article>;
}
