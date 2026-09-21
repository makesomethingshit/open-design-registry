import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { changeSummary, isVisible } from "@/src/lib/proposal-handlers";
import { revisionUrlSchema } from "@/src/lib/project-validation";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";
import { readRevisionBundle } from "@/src/lib/revision-bundle";
import { Tag } from "@/src/components/ui/badge";
import { FormColumn, PageGrid, ReadingColumn } from "@/src/components/ui/layout";
import CapabilityBadge from "@/app/capability-badge";
import RevisionDiff from "../../revision-diff";
import ReportForm from "../../../../reports/report-form";
import ForkForm from "./fork-form";
import RestoreForm from "./restore-form";
import SourceRights from "./source-rights";

export const dynamic = "force-dynamic";

export default async function RevisionPage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const revisionNumber = Number(number);
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) notFound();
  const project = await prisma.project.findUnique({ where: { slug }, include: { owner: { select: { name: true } } } });
  if (!project) notFound();
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();
  const revision = await prisma.revision.findUnique({
    where: { projectId_number: { projectId: project.id, number: revisionNumber } },
    include: {
      previews: { orderBy: [{ position: "asc" }, { key: "asc" }] },
      parent: { include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } } },
      appliedProposal: {
        select: {
          id: true,
          proposalNumber: true,
          title: true,
          project: { select: { id: true, ownerId: true, isPublic: true } },
          baseRevision: { select: { projectId: true, isPublished: true } },
          sourceRevision: { select: { isPublished: true, project: { select: { ownerId: true, isPublic: true } } } },
          author: { select: { name: true } },
        },
      },
      appliedChanges: {
        orderBy: { createdAt: "asc" },
        select: { id: true, appliedRevisionId: true, type: true, action: true, target: true, name: true, newName: true, kind: true },
      },
      rightsDeclarations: { orderBy: { version: "desc" }, take: 1, include: { items: true } },
    },
  });
  if (!revision?.isPublished) notFound();
  const previous = revision.parent;
  const appliedProposal = revision.appliedProposal && isVisible(revision.appliedProposal, session?.user.id) ? revision.appliedProposal : null;
  const appliedChanges = revision.sourceProposalId && !appliedProposal
    ? []
    : (revision.appliedChanges ?? []).filter((change) => change.appliedRevisionId === revision.id);
  const currentPreviews = revision.previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) }));
  const previousPreviews = previous?.previews.map((preview) => ({ ...preview, url: publicAssetUrl(preview.url) }));
  const currentImagePreviews = currentPreviews.filter((preview) => preview.mimeType !== "text/html");
  const previousImagePreviews = previousPreviews?.filter((preview) => preview.mimeType !== "text/html");
  const htmlPreviews = currentPreviews.filter((preview) => preview.mimeType === "text/html");
  const sourceFiles = (await readRevisionBundle(revision.sourceKey))?.files.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size, href: `/api/projects/${encodeURIComponent(project.slug)}/revisions/${revision.number}/files/${encodeURIComponent(id)}` })) ?? [];
  const sourceUrl = revision.sourceUrl && revisionUrlSchema.safeParse(revision.sourceUrl).success ? revision.sourceUrl : null;
  const sourceHref = sourceUrl ?? (!sourceFiles.length && revision.sourceKey ? publicAssetUrl(revision.sourceKey) : null);
  const hasProvenance = Boolean(previous || appliedProposal || appliedChanges.length > 0);
  const declarationRecord = revision.rightsDeclarations?.[0];
  const declaration = declarationRecord ? {
    id: declarationRecord.id,
    version: declarationRecord.version,
    sourceRightsMode: declarationRecord.sourceRightsMode,
    sourceLicenseName: declarationRecord.sourceLicenseName,
    sourceLicenseUrl: declarationRecord.sourceLicenseUrl,
    sourceRightsHolder: declarationRecord.sourceRightsHolder,
    notes: declarationRecord.notes,
    createdAt: declarationRecord.createdAt instanceof Date ? declarationRecord.createdAt.toISOString() : String(declarationRecord.createdAt),
    items: declarationRecord.items.map((item) => ({ type: item.type, name: item.name, sourceFileId: item.sourceFileId, rightsHolder: item.rightsHolder, licenseName: item.licenseName, licenseUrl: item.licenseUrl, sourceUrl: item.sourceUrl, redistribution: item.redistribution, derivativeUse: item.derivativeUse, notes: item.notes })),
  } : null;
  return <PageGrid aria-labelledby="revision-heading">
    <ReadingColumn>
      <article className="detail">
    <p className="meta"><Link href={`/projects/${project.slug}`}>{project.title}</Link> · Revision {revision.number}</p>
    <h1 id="revision-heading">{revision.title}</h1>
    <p className="meta">Published by {project.owner.name} · <time dateTime={revision.createdAt.toISOString()}>{revision.createdAt.toLocaleString("ko-KR")}</time></p>
    <p>{revision.changeDescription}</p>
    <CapabilityBadge mode={revision.capabilityMode} unitCount={revision.capabilityUnitCount} label={`Revision ${revision.number}`} adapterId={revision.adapterId} adapterVersion={revision.adapterVersion} adapterConfidence={revision.adapterConfidence} adapterMaturity={revision.adapterMaturity} />
    {revision.tags.length > 0 && <div aria-label="Revision tags">{revision.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>}
    <p className="meta">Revision license: {revision.license ?? "Not recorded for this legacy revision"}</p>
    {!revision.license && <p className="meta">The original publication license is unknown. Forking uses the current project license ({project.license}); confirm your rights before continuing.</p>}
    <SourceRights slug={project.slug} number={revision.number} revisionLicense={revision.license} sourceHref={sourceHref} sourceFiles={sourceFiles} tool={revision.tool} toolVersion={revision.toolVersion} sourceChecksum={revision.sourceChecksum} declaration={declaration} isOwner={session?.user.id === project.ownerId} />
    {hasProvenance && <section aria-labelledby="revision-provenance"><h2 id="revision-provenance">Provenance</h2><dl>
      {previous && <div><dt>Created from</dt><dd><Link href={`/projects/${project.slug}/revisions/${previous.number}`}>Revision {previous.number}</Link></dd></div>}
      {appliedProposal && <div><dt>Applied from</dt><dd><Link href={`/proposals/${appliedProposal.id}`}>Proposal #{appliedProposal.proposalNumber} · {appliedProposal.title}</Link>{appliedProposal.author?.name && <span className="meta"> by {appliedProposal.author.name}</span>}</dd></div>}
      {appliedChanges.length > 0 && <div><dt>Applied changes</dt><dd><ul className="commit-previews" aria-label="Applied changes">{appliedChanges.map((change) => <li className="commit-chip" key={change.id}>{changeSummary(change)}{change.kind ? ` · ${change.kind}` : ""}</li>)}</ul></dd></div>}
    </dl></section>}
      </article>
    </ReadingColumn>
    {(currentImagePreviews.length > 0 || Boolean(previousImagePreviews?.length) || htmlPreviews.length > 0) && <ReadingColumn>
      <section className="detail" aria-label="Revision visual previews">
        {(currentImagePreviews.length > 0 || Boolean(previousImagePreviews?.length)) && <RevisionDiff current={currentImagePreviews} previous={previousImagePreviews} currentNumber={revision.number} previousNumber={previous?.number} />}
    {htmlPreviews.length > 0 && <section aria-labelledby="html-previews"><h2 id="html-previews">HTML previews</h2><div className="html-previews">{htmlPreviews.map((preview) => <figure className="preview-diff" key={preview.id}><figcaption>{preview.altText}</figcaption><iframe className="html-preview" src={preview.url} title={preview.altText} sandbox="" loading="lazy" /></figure>)}</div></section>}
      </section>
    </ReadingColumn>
    }
    <FormColumn>
      <div className="detail revision-actions">
        {session?.user.id === project.ownerId && <RestoreForm slug={project.slug} number={revision.number} />}<ForkForm slug={project.slug} number={revision.number} license={revision.license ?? project.license} signedIn={project.isPublic && Boolean(session)} />{project.isPublic && <ReportForm revisionId={revision.id} />}
      </div>
    </FormColumn>
  </PageGrid>;
}
