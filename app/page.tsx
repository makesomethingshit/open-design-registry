import Link from "next/link";
import { ProjectCard } from "@/src/components/design/project-card";
import { Button, TextLink } from "@/src/components/ui/button";
import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const licenseOptions = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "MIT"];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = firstValue(params.q);
  const license = firstValue(params.license);
  const tool = firstValue(params.tool).toLowerCase();
  const tag = firstValue(params.tag).toLowerCase();
  const sort = firstValue(params.sort) === "recent" ? "recent" : "";
  const projects = await prisma.project.findMany({
    where: {
      isPublic: true,
      ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {}),
      ...(license ? { license } : {}),
      ...(tool || tag ? { revisions: { some: { ...(tool ? { tool: { equals: tool } } : {}), ...(tag ? { tags: { hasEvery: [tag] } } : {}) } } } : {}),
    },
    orderBy: sort === "recent" ? { updatedAt: "desc" } : { createdAt: "desc" },
    take: 24,
    include: { owner: { select: { name: true } }, revisions: { where: { isPublished: true }, orderBy: { createdAt: "desc" }, take: 1, select: { tags: true } } },
  });
  const hasActiveFilter = Boolean(license || tool || tag || sort);

  return <div className={styles.explore}>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>Explore</p><h1>Design work with a visible history.</h1></div>
      <Link className={styles.createProject} href="/projects/new">Create a project</Link>
    </header>
    <section aria-labelledby="public-projects-heading" className={styles.projects}>
      <header className={styles.sectionHeader}><div><p className={styles.eyebrow}>Public registry</p><h2 id="public-projects-heading">Projects</h2></div><p className={styles.count}>{projects.length} {projects.length === 1 ? "project" : "projects"}</p></header>
      <form action="/" className={styles.filters} method="get">
        <div className={styles.searchRow}>
          <label className={styles.searchLabel} htmlFor="project-search">Search projects<input defaultValue={query} id="project-search" name="q" placeholder="Search by project or description" type="search" /></label>
          <Button className={styles.searchButton} type="submit">Search</Button>
        </div>
        <details className={styles.filterGroup} open={hasActiveFilter}>
          <summary>Filters</summary>
          <div className={styles.filterFields}>
            <label>Tool<input defaultValue={tool} name="tool" placeholder="Figma, Penpot" /></label>
            <label>Tag<input defaultValue={tag} name="tag" placeholder="mobile, ui" /></label>
            <label>License<select defaultValue={license} name="license"><option value="">All licenses</option>{licenseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            <label>Sort<select defaultValue={sort} name="sort"><option value="">Newest first</option><option value="recent">Recently active</option></select></label>
          </div>
          {hasActiveFilter && <TextLink href="/">Clear filters</TextLink>}
        </details>
      </form>
      {projects.length ? <div aria-label="Public projects" className={styles.gallery}>{projects.map((project, index) => <ProjectCard activityStatus={project.activityStatus} coverUrl={publicAssetUrl(project.coverUrl)} description={project.description} href={`/projects/${project.slug}`} key={project.id} license={project.license} owner={project.owner.name} priority={index < 4} tags={project.revisions[0]?.tags ?? []} title={project.title} updatedAt={project.updatedAt} />)}</div> : <p className={styles.empty}>No public projects match those filters.</p>}
    </section>
  </div>;
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
