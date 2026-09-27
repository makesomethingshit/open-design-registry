import { redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/src/components/ui/banner";
import { ProjectCard } from "@/src/components/design/project-card";
import { getSession } from "@/src/lib/session";
import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";
import exploreStyles from "../page.module.css";
import styles from "./stars.module.css";

export const dynamic = "force-dynamic";

export default async function StarsPage() {
  const session = await getSession();
  if (!session) return redirect("/login");

  const stars = await prisma.projectStar.findMany({
    where: { userId: session.user.id, project: { isPublic: true } },
    orderBy: { createdAt: "desc" },
    select: {
      project: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          license: true,
          coverUrl: true,
          activityStatus: true,
          updatedAt: true,
          owner: { select: { name: true } },
          revisions: { where: { isPublished: true }, orderBy: { createdAt: "desc" }, take: 1, select: { tags: true } },
        },
      },
    },
  });

  return <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Workspace</p>
      <h1>Starred projects</h1>
      <p className={styles.subtitle}>Projects you want to revisit.</p>
    </header>
    <section aria-labelledby="starred-projects-heading" className={styles.projects}>
      <header className={styles.sectionHeader}>
        <h2 id="starred-projects-heading">Projects</h2>
        <p>Most recently starred first</p>
      </header>
      {stars.length ? <div aria-label="Starred projects" className={exploreStyles.gallery}>
        {stars.map(({ project }, index) => <ProjectCard activityStatus={project.activityStatus} coverUrl={project.coverUrl ? publicAssetUrl(project.coverUrl) : ""} description={project.description} href={`/projects/${project.slug}`} key={project.id} license={project.license} owner={project.owner.name} priority={index < 4} tags={project.revisions[0]?.tags ?? []} title={project.title} updatedAt={project.updatedAt} />)}
      </div> : <EmptyState action={<Link className={styles.exploreLink} href="/#public-projects-heading">Explore projects</Link>} title="No starred projects yet.">Star projects you want to revisit.</EmptyState>}
    </section>
  </div>;
}
