import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { ContributionError, listContributions } from "@/src/lib/contributions";
import ContributionForm from "./contribution-form";
export const dynamic = "force-dynamic";

export default async function ContributionsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const data = await listContributions(slug, session?.user.id, (await searchParams).cursor).catch((error) => { if (error instanceof ContributionError && error.status === 404) notFound(); throw error; });
  const latest = await prisma.revision.findFirst({ where: { projectId: data.project.id, isPublished: true }, orderBy: { number: "desc" }, select: { id: true, number: true } });
  const forks = session && data.project.isPublic ? await prisma.project.findMany({ where: { ownerId: session.user.id, isPublic: true, forkedFromProjectId: data.project.id }, orderBy: { createdAt: "desc" }, take: 20, select: { title: true, revisions: { where: { isPublished: true, license: { not: null } }, orderBy: { number: "desc" }, take: 20, select: { id: true, number: true, title: true } } } }) : [];
  const choices = forks.flatMap((fork) => fork.revisions.map((revision) => ({ id: revision.id, label: `${fork.title} — Revision ${revision.number}: ${revision.title}` })));
  return <section>
    <p className="meta"><Link href={`/projects/${slug}`}>{data.project.title}</Link></p>
    <h1>Contributions</h1><p className="lede">Propose improvements, review changes, and build this project together.</p>
    <div className="repo-list">{data.items.map((item) => <article className="repo-row" key={item.id}><div><Link className="repo-name" href={`/projects/${slug}/contributions/${item.id}`}>{item.title}</Link><p className="meta">{item.status.replaceAll("_", " ")} · Proposed by {item.authorName}{item.acceptedRevision ? ` · Accepted as Revision ${item.acceptedRevision.number}` : ""}</p></div></article>)}</div>
    {!data.items.length && <p className="empty-state">No contribution proposals yet.</p>}
    {data.nextCursor && <Link className="button secondary" href={`?cursor=${data.nextCursor}`}>Older proposals</Link>}
    {session && data.project.isPublic && latest ? <ContributionForm slug={slug} baseRevisionId={latest.id} baseNumber={latest.number} choices={choices} /> : <p className="meta">{!session ? "Sign in to propose a change." : "Publish a revision in a public project before accepting proposals."}</p>}
  </section>;
}
