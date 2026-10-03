import { Suspense } from "react";
import Link from "next/link";
import { ProjectCard } from "@/src/components/design/project-card";
import { Button, TextLink } from "@/src/components/ui/button";
import buttonStyles from "@/src/components/ui/button.module.css";
import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";
import styles from "./page.module.css";
import { ProjectSearchInput } from "../global-search";

export const dynamic = "force-dynamic";

const licenseOptions = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "MIT"];
const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.lg}`;

type SearchParams = Record<string, string | string[] | undefined>;
type ProjectFilters = { query: string; license: string; tool: string; tag: string; sort: string };

function findProjects({ query, license, tool, tag, sort }: ProjectFilters) {
  return prisma.project.findMany({
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
}

type ProjectQuery = ReturnType<typeof findProjects>;

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = firstValue(params.q);
  const license = firstValue(params.license);
  const tool = firstValue(params.tool).toLowerCase();
  const tag = firstValue(params.tag).toLowerCase();
  const sort = firstValue(params.sort) === "recent" ? "recent" : "";
  const projects = findProjects({ query, license, tool, tag, sort });
  const hasActiveFilter = Boolean(license || tool || tag || sort);
  const hasMatchCondition = Boolean(query || license || tool || tag);
  const retryQuery = new URLSearchParams();
  for (const [key, value] of Object.entries({ q: query, license, tool, tag, sort })) {
    if (value) retryQuery.set(key, value);
  }
  const retryHref = retryQuery.toString() ? `/explore?${retryQuery}` : "/explore";

  return <div className={styles.explore}>
    <section aria-labelledby="projects-heading" className={styles.projects} id="projects">
      <header className={styles.sectionHeader}>
        <h1 id="projects-heading" tabIndex={-1}>Explore projects</h1>
        <p className={styles.sectionDescription}>Find public design projects with source files, published revisions, and ways to contribute.</p>
      </header>
      <form action="/explore" className={styles.filters} method="get" role="search" aria-label="Explore projects">
        <label className={styles.searchField}>Search public projects<ProjectSearchInput placeholder="Search by title or description" /></label>
        <Button type="submit" variant="secondary">Search</Button>
        <details className={styles.filterGroup} open={hasActiveFilter}>
          <summary>Filters</summary>
          <div className={styles.filterPanel}>
            <div className={styles.filterFields}>
              <label>Tool<input defaultValue={tool} name="tool" placeholder="Figma, Penpot" /></label>
              <label>Tag<input defaultValue={tag} name="tag" placeholder="mobile, ui" /></label>
              <label>License<select defaultValue={license} name="license"><option value="">All licenses</option>{licenseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
              <label>Sort<select defaultValue={sort} name="sort"><option value="">Newest first</option><option value="recent">Recently active</option></select></label>
            </div>
            <Button type="submit" variant="secondary">Apply filters</Button>
          </div>
        </details>
        {(query || hasActiveFilter) && <TextLink href="/explore">Clear filters</TextLink>}
      </form>
      {query && <p className={styles.searchStatus} role="status">Search: <strong>{query}</strong> <TextLink href="#global-search-input">Edit search</TextLink> <TextLink href="#projects-heading">Go to results</TextLink></p>}
      <Suspense fallback={<ProjectsLoading />}>
        <ProjectResults hasMatchCondition={hasMatchCondition} projects={projects} retryHref={retryHref} />
      </Suspense>
      <p className={styles.secondaryActions}><TextLink href="/contribute">Find design requests</TextLink> <TextLink href="/projects/new">Create a project</TextLink></p>
    </section>
  </div>;
}

async function ProjectResults({ hasMatchCondition, projects, retryHref }: { hasMatchCondition: boolean; projects: ProjectQuery; retryHref: string }) {
  let rows: Awaited<ProjectQuery>;
  try {
    rows = await projects;
  } catch {
    return <div className={styles.loadError} role="alert"><h3>Projects could not be loaded</h3><p>Please try again.</p><TextLink href={retryHref}>Try again</TextLink></div>;
  }

  if (!rows.length) return hasMatchCondition
    ? <div className={styles.empty} role="status"><h3>No projects match these filters</h3><p>Clear the search or filters to explore all public projects.</p><TextLink href="/explore">Clear filters</TextLink></div>
    : <div className={styles.empty} role="status"><h3>No public projects yet</h3><p>Start the registry with a public design project.</p><Link className={secondaryLink} href="/projects/new">Create the first project</Link></div>;

  return <>
    <p className={styles.count} aria-live="polite">{rows.length} {rows.length === 1 ? "project" : "projects"}</p>
    <div className={styles.gallery}>{rows.map((project, index) => <ProjectCard activityStatus={project.activityStatus} coverUrl={project.coverUrl ? publicAssetUrl(project.coverUrl) : ""} description={project.description} href={`/projects/${project.slug}`} key={project.id} license={project.license} owner={project.owner.name} priority={index < 4} tags={project.revisions[0]?.tags ?? []} title={project.title} titleLevel={3} updatedAt={project.updatedAt} />)}</div>
  </>;
}

function ProjectsLoading() {
  return <div aria-busy="true" className={styles.gallery}>
    <p className="sr-only" role="status">Loading public projects</p>
    {[0, 1, 2].map((index) => <div aria-hidden="true" className={styles.skeletonCard} key={index}><span className={styles.skeletonMedia} /><span className={styles.skeletonTitle} /><span className={styles.skeletonMeta} /></div>)}
  </div>;
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
