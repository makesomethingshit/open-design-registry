import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { findVisibleProposal } from "@/src/lib/proposal-handlers";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import { readRevisionBundle } from "@/src/lib/revision-bundle";
import { conflictForChange } from "@/src/lib/proposal-conflicts";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";
import { Banner } from "@/src/components/ui/banner";
import { StatusBadge } from "@/src/components/ui/badge";
import { PageGrid, WideColumn } from "@/src/components/ui/layout";
import CapabilityBadge from "@/app/capability-badge";
import ProposalReview from "./proposal-review";
import styles from "./proposal-page.module.css";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const proposal = await findVisibleProposal(id, session?.user.id);
  if (!proposal) notFound();
  const latest = await prisma.revision.findFirst({ where: { projectId: proposal.project.id, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, sourceKey: true, capabilityMode: true, capabilityUnitCount: true, previews: { orderBy: [{ position: "asc" }, { key: "asc" }], select: { id: true, position: true, key: true, url: true, mimeType: true, altText: true } } } });
  const toRevision = (revision: { id: string; number: number; title: string; capabilityMode?: string | null; capabilityUnitCount?: number | null; previews: Array<{ id: string; position: number; key: string; url: string; mimeType: string; altText: string }> }) => ({ ...revision, previews: revision.previews.filter((preview) => preview.mimeType !== "text/html").map(({ key: _key, ...preview }) => ({ ...preview, url: publicAssetUrl(preview.url) })) });
  const baseRevision = toRevision(proposal.baseRevision);
  const sourceRevision = toRevision(proposal.sourceRevision);
  const latestRevision = latest ? toRevision(latest) : null;
  const [baseBundle, sourceBundle, latestBundle] = await Promise.all([readRevisionBundle(proposal.baseRevision.sourceKey), readRevisionBundle(proposal.sourceRevision.sourceKey), readRevisionBundle(latest?.sourceKey)]);
  const previewsFor = (revision: { previews: Array<{ key: string; id: string; position: number; url: string; mimeType: string; altText: string }> }, keys: string[] | undefined) => (keys ?? []).map((key) => revision.previews.find((preview) => preview.key === key)).filter((preview): preview is { id: string; position: number; key: string; url: string; mimeType: string; altText: string } => Boolean(preview)).filter((preview) => preview.mimeType !== "text/html").map(({ key: _key, ...preview }, position) => ({ ...preview, position, url: publicAssetUrl(preview.url) }));
  const changes = proposal.changeSet?.changes.map((change) => {
    const action = change.action ?? change.type;
    const sourceFile = sourceBundle?.files.find((file) => file.assetKey === change.assetKey);
    const baseFile = baseBundle?.files.find((file) => file.id === change.targetFileId);
    const latestFile = latestBundle?.files.find((file) => file.id === change.targetFileId);
    const conflict = action === "REPLACE_DOCUMENT"
      ? null
      : latest && latest.id !== proposal.baseRevisionId
        ? conflictForChange(change, baseBundle, latestBundle)
        : { status: "NO_CONFLICT" as const, reason: "No upstream conflict." };
    return {
      id: change.id, type: change.type, action: change.action ?? change.type, target: change.target, targetFileId: change.targetFileId, name: change.name, newName: change.newName, kind: change.kind, mimeType: change.mimeType, size: change.size,
      reviewStatus: change.reviewStatus, reviewComment: change.reviewComment, reviewedBy: change.reviewedBy && { name: change.reviewedBy.name }, appliedRevision: change.appliedRevision ?? (change.type === "REPLACE_DOCUMENT" ? proposal.appliedRevisions[0] ?? null : null), reviewHistory: change.reviewHistory.map((review) => ({ id: review.id, status: review.status, eventType: review.eventType, comment: review.comment, reason: review.reason, createdAt: review.createdAt, author: review.author && { name: review.author.name }, checkedLatestRevisionId: review.checkedLatestRevisionId, causedByRevision: review.causedByRevision })),
      latestAvailable: action === "ADD_UNIT" || action === "REPLACE_DOCUMENT" || Boolean(latestFile),
      latestName: latestFile?.name ?? null,
      conflictStatus: conflict?.status ?? null,
      conflictReason: conflict?.reason ?? null,
      checkedLatestRevisionId: latest?.id ?? proposal.baseRevisionId,
      sourcePreviews: action === "REMOVE_UNIT" ? [] : sourceFile ? previewsFor(proposal.sourceRevision, sourceFile.previewKeys) : sourceRevision.previews,
      basePreviews: action === "ADD_UNIT" ? [] : baseFile ? previewsFor(proposal.baseRevision, baseFile.previewKeys) : baseRevision.previews,
      latestPreviews: latestFile && latest ? previewsFor(latest, latestFile.previewKeys) : latestRevision?.previews ?? [],
    };
  }) ?? [];
  const stale = Boolean(latest && latest.id !== proposal.baseRevisionId);
  const latestUnitCount = latestBundle?.files.length ?? latest?.capabilityUnitCount ?? null;
  const knownConflictCount = new Set(changes.filter((change) => !change.appliedRevision && change.conflictStatus === "CONFLICT" && change.targetFileId).map((change) => change.targetFileId)).size;
  const unavailableConflictCount = new Set(changes.filter((change) => !change.appliedRevision && change.conflictStatus === "CHECK_UNAVAILABLE" && change.targetFileId).map((change) => change.targetFileId)).size;
  const isOwner = session?.user.id === proposal.project.ownerId;
  const canClose = Boolean(session && (isOwner || session.user.id === proposal.authorId));
  const proposalStatus = proposalStatusPresentation(proposal.status, changes.filter((change) => change.appliedRevision).length, changes.length);
  return <PageGrid aria-labelledby="proposal-heading">
    <WideColumn>
      <article className={styles.page}>
    <header className={styles.header}>
      <p className={styles.breadcrumb}><Link href={`/projects/${proposal.project.slug}`}>{proposal.project.title}</Link> - Proposal #{proposal.proposalNumber}</p>
      <div className={styles.titleRow}><h1 id="proposal-heading">{proposal.title}</h1><StatusBadge icon={proposalStatus.icon} tone={proposalStatus.tone}>{proposalStatus.label}</StatusBadge></div>
      <p className={styles.meta}>{proposal.author.name} proposes {proposal.sourceRevision.project.title} Revision {proposal.sourceRevision.number} to {proposal.project.title} Revision {proposal.baseRevision.number}</p>
      <div className={styles.capabilities}>
        <CapabilityBadge mode={proposal.baseRevision.capabilityMode} unitCount={proposal.baseRevision.capabilityUnitCount} label={`Base Revision ${proposal.baseRevision.number}`} adapterId={proposal.baseRevision.adapterId} adapterVersion={proposal.baseRevision.adapterVersion} adapterConfidence={proposal.baseRevision.adapterConfidence} adapterMaturity={proposal.baseRevision.adapterMaturity} />
        <CapabilityBadge mode={proposal.sourceRevision.capabilityMode} unitCount={proposal.sourceRevision.capabilityUnitCount} label={`Source Revision ${proposal.sourceRevision.number}`} adapterId={proposal.sourceRevision.adapterId} adapterVersion={proposal.sourceRevision.adapterVersion} adapterConfidence={proposal.sourceRevision.adapterConfidence} adapterMaturity={proposal.sourceRevision.adapterMaturity} />
      </div>
      <p className={styles.summary}>{proposal.body}</p>
      {proposal.relatedIssue && <p className={styles.meta}>Related issue: <Link href={`/projects/${proposal.project.slug}#issue-${proposal.relatedIssue.id}`}>{proposal.relatedIssue.title}</Link></p>}
      {proposal.appliedRevisions.length > 0 && <Banner tone="success" title="Applied changes">{proposal.appliedRevisions.map((revision) => <Link key={revision.id} href={`/projects/${proposal.project.slug}/revisions/${revision.number}`}>Revision {revision.number}</Link>)}</Banner>}
      {!proposal.sourceRevision.project.isPublic && session?.user.id === proposal.authorId && <Banner className={styles.privateNote} tone="warning" title="Private workspace">Visible to you. The project owner cannot review this proposal while its source is private.</Banner>}
    </header>
    <ProposalReview proposalId={proposal.id} projectSlug={proposal.project.slug} baseRevision={baseRevision} sourceRevision={sourceRevision} latestRevision={latestRevision} latestUnitCount={latestUnitCount} stale={stale} knownConflictCount={knownConflictCount} unavailableConflictCount={unavailableConflictCount} status={proposal.status} changes={changes} comments={proposal.comments} signedIn={Boolean(session)} isOwner={isOwner} canClose={canClose} />
      </article>
    </WideColumn>
  </PageGrid>;
}
