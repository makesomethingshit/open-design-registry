import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { ContributionError, getContribution } from "@/src/lib/contributions";
import ContributionActions from "./contribution-actions";
export const dynamic = "force-dynamic";
type Snapshot = Awaited<ReturnType<typeof getContribution>>["contribution"]["proposedRevision"];

function SnapshotView({ title, revision }: { title: string; revision: Snapshot }) {
  return <section className="repo-panel"><h3>{title}</h3><p>{revision.title} · Revision {revision.number}</p><p className="meta">License: {revision.license ?? "Not recorded"}</p>
    {revision.sourceUrl && <a className="button secondary" href={revision.sourceUrl} target="_blank" rel="noreferrer">Open original file</a>}
    <div className="contribution-previews">{revision.previews.map((preview) => <figure key={preview.id}><figcaption>{preview.altText}</figcaption>{preview.mimeType === "text/html" ? <iframe className="html-preview" src={preview.url} title={preview.altText} sandbox="" loading="lazy" /> : <img src={preview.url} alt={preview.altText} loading="lazy" />}</figure>)}</div>
  </section>;
}
export default async function ContributionPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ before?: string }> }) {
  const { slug, id } = await params; const session = await getSession();
  const data = await getContribution(slug, id, session?.user.id, (await searchParams).before).catch((error) => { if (error instanceof ContributionError && error.status === 404) notFound(); throw error; });
  const { contribution, project, latest } = data;
  const stale = latest?.id !== contribution.baseRevisionId;
  const canUpdate = session?.user.id === contribution.authorId && project.isPublic;
  const revisions = canUpdate ? await prisma.revision.findMany({ where: { projectId: contribution.sourceProjectId, isPublished: true, license: { not: null }, project: { isPublic: true, ownerId: session!.user.id } }, orderBy: { number: "desc" }, take: 50, select: { id: true, number: true, title: true } }) : [];
  return <article>
    <p className="meta"><Link href={`/projects/${slug}`}>{project.title}</Link> / <Link href={`/projects/${slug}/contributions`}>Contributions</Link></p>
    <h1>{contribution.title}</h1><p className="meta"><span role="status">{contribution.status.replaceAll("_", " ")}</span> · Proposed by {contribution.authorName} from {contribution.sourceProjectTitle}</p><p className="contribution-body">{contribution.body}</p>
    {contribution.acceptedRevision && <p className="contribution-result" role="status">Accepted as <Link href={`/projects/${slug}/revisions/${contribution.acceptedRevision.number}`}>Revision {contribution.acceptedRevision.number}</Link> · Contributed by {contribution.acceptedRevision.contributorName} · Accepted by {contribution.acceptedRevision.acceptedByName}</p>}
    <h2>Compare the design</h2><div className="contribution-comparison"><SnapshotView title="Project baseline" revision={contribution.baseRevision} /><SnapshotView title="Proposed design" revision={contribution.proposedRevision} /></div>
    {stale && latest && contribution.status !== "ACCEPTED" && <><p role="status">The project now has Revision {latest.number}. Compare it with your proposal before resubmitting.</p><SnapshotView title="Current project design" revision={latest} /></>}
    <section className="repo-panel"><h2>Discussion and review history</h2><ol className="contribution-history">{data.events.map((event) => <li key={event.id}><p><strong>{event.actorName}</strong> · {event.type.replaceAll("_", " ")} · proposal version {event.version}</p><p className="contribution-body">{event.body}</p><p className="meta">Project Revision {event.baseRevision.number} / Proposed Revision {event.proposedRevision.number} · <time dateTime={event.createdAt.toISOString()}>{event.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</time></p></li>)}</ol>{data.nextCursor && <Link className="button secondary" href={`?before=${data.nextCursor}`}>Older activity</Link>}</section>
    <ContributionActions slug={slug} id={id} version={contribution.version} status={contribution.status} signedIn={Boolean(session)} canReview={session?.user.id === project.ownerId} canUpdate={canUpdate} stale={stale} licenseMatches={Boolean(contribution.proposedRevision.license && contribution.proposedRevision.license === project.license)} latestId={latest?.id} latestNumber={latest?.number} choices={revisions.map((revision) => ({ id: revision.id, label: `Revision ${revision.number}: ${revision.title}` }))} />
  </article>;
}
