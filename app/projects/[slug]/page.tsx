import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    include: { owner: { select: { name: true } }, revisions: { orderBy: { number: "desc" }, include: { previews: true } } },
  });
  if (!project) notFound();
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) notFound();
  return <article className="detail">
    <p className="meta">{project.owner.name} · {project.license} · {project.isPublic ? "Public" : "Private"}</p>
    <h1>{project.title}</h1><p className="lede">{project.description}</p>
    <img src={project.coverUrl} alt={`${project.title} cover`} />
    <section><h2>Revisions</h2>{project.revisions.length ? <ol>{project.revisions.map((revision) => <li key={revision.id}>Revision {revision.number} · {revision.previews.length} preview{revision.previews.length === 1 ? "" : "s"}</li>)}</ol> : <p>No revisions published yet.</p>}</section>
  </article>;
}
