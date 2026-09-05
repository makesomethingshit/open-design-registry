import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";

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
    include: { owner: { select: { name: true } }, revisions: { orderBy: { createdAt: "desc" }, take: 1, select: { tags: true } } },
  });
  return <>
    <section className="hero">
      <p className="eyebrow">Open Design Registry</p>
      <h1>Design, with a history.</h1>
      <p className="lede">A public home for design projects that anyone can inspect, reuse, and carry forward across tools.</p>
      <a className="button" href="/projects/new">Create a project</a>
    </section>
    <section className="repo-section" aria-labelledby="public-projects-heading">
      <div className="section-heading"><div><p className="eyebrow">Explore</p><h2 id="public-projects-heading">Public projects</h2></div><span className="section-count">{projects.length}</span></div>
      <form className="project-filters" method="get" action="/">
        <label>Search<input name="q" type="search" defaultValue={query} placeholder="Search projects" /></label>
        <label>Tool<input name="tool" defaultValue={tool} placeholder="Figma, Penpot" /></label>
        <label>Tag<input name="tag" defaultValue={tag} placeholder="mobile, ui" /></label>
        <label>License<select name="license" defaultValue={license}><option value="">All licenses</option>{licenseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Sort<select name="sort" defaultValue={sort}><option value="">Newest first</option><option value="recent">Recently active</option></select></label>
        <button className="button" type="submit">Search</button>
        {(query || license || tool || tag || sort) && <a className="button secondary" href="/">Clear</a>}
      </form>
      {projects.length ? <div className="repo-list" aria-label="Public projects">{projects.map((project) => {
        const tags = project.revisions[0]?.tags ?? [];
        return <article className="repo-row" key={project.id}>
          <div className="repo-icon"><img src={publicAssetUrl(project.coverUrl)} alt="" /></div>
          <div className="repo-row-main">
            <div className="repo-row-heading"><a className="repo-name" href={`/projects/${project.slug}`}>{project.title}</a><span className="repo-visibility public">Public</span></div>
            <p className="repo-description">{project.description || "No description provided."}</p>
            <div className="repo-meta"><span>{project.owner.name}</span><span>{project.license}</span>{tags.map((projectTag) => <span className="topic-tag" key={projectTag}>{projectTag}</span>)}<span>Updated <time dateTime={project.updatedAt.toISOString()}>{formatDate(project.updatedAt)}</time></span></div>
          </div>
        </article>;
      })}</div> : <p className="empty-state">No public projects match those filters.</p>}
    </section>
  </>;
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
