import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { publicAssetUrl } from "@/src/lib/storage";

export const dynamic = "force-dynamic";

export default async function MyProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const projects = await prisma.project.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { revisions: { select: { id: true, tags: true } } },
  });
  return <section>
    <div className="page-heading"><div><p className="eyebrow">Workspace</p><h1>My projects</h1><p className="lede">Your public and private design repositories, all in one place.</p></div><Link className="button" href="/projects/new">New project</Link></div>
    {projects.length ? <div className="repo-list" aria-label="My projects">{projects.map((project) => {
      const tags = [...new Set(project.revisions.flatMap((revision) => revision.tags))].slice(0, 5);
      return <article className="repo-row" key={project.id}>
        <div className="repo-icon"><img src={publicAssetUrl(project.coverUrl)} alt="" /></div>
        <div className="repo-row-main">
          <div className="repo-row-heading"><Link className="repo-name" href={`/projects/${project.slug}`}>{project.title}</Link><span className={`repo-visibility ${project.isPublic ? "public" : "private"}`}>{project.isPublic ? "Public" : "Private"}</span></div>
          <p className="repo-description">{project.description || "No description provided."}</p>
          <div className="repo-meta"><span>{project.revisions.length} revisions</span><span>{project.license}</span>{tags.map((tag) => <span className="topic-tag" key={tag}>{tag}</span>)}<span>Updated <time dateTime={project.updatedAt.toISOString()}>{formatDate(project.updatedAt)}</time></span></div>
        </div>
      </article>;
    })}</div> : <div className="empty-state"><p>You do not have any projects yet.</p><Link className="button" href="/projects/new">Create your first project</Link></div>}
  </section>;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
