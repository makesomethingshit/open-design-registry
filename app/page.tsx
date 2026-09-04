import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";

export const dynamic = "force-dynamic";

const licenseOptions = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "MIT"];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = firstValue(params.q);
  const license = firstValue(params.license);
  const tool = firstValue(params.tool);
  const tag = firstValue(params.tag).toLowerCase();
  const sort = firstValue(params.sort) === "recent" ? "recent" : "";
  const projects = await prisma.project.findMany({
    where: {
      isPublic: true,
      ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {}),
      ...(license ? { license } : {}),
      ...(tool || tag ? { revisions: { some: { ...(tool ? { tool: { equals: tool, mode: "insensitive" } } : {}), ...(tag ? { tags: { has: tag } } : {}) } } } : {}),
    },
    orderBy: sort === "recent" ? { updatedAt: "desc" } : { createdAt: "desc" },
    take: 24,
    include: { owner: { select: { name: true } } },
  });
  return <>
    <section className="hero">
      <p className="meta">TOOL-NEUTRAL DESIGN REGISTRY</p>
      <h1>Make it open.</h1>
      <p className="lede">Publish design projects that anyone can inspect, reuse, and carry forward across tools.</p>
      <a className="button" href="/projects/new">Create a project</a>
    </section>
    <section aria-labelledby="public-projects-heading">
      <h2 id="public-projects-heading">Public projects</h2>
      <form className="project-filters" method="get" action="/">
        <label>Title or description<input name="q" type="search" defaultValue={query} placeholder="Search projects" /></label>
        <label>Tool<input name="tool" defaultValue={tool} placeholder="Figma, Penpot…" /></label>
        <label>Tag<input name="tag" defaultValue={tag} placeholder="mobile, ui…" /></label>
        <label>License<select name="license" defaultValue={license}><option value="">All licenses</option>{licenseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label>Sort<select name="sort" defaultValue={sort}><option value="">Newest first</option><option value="recent">Recently active</option></select></label>
        <button className="button" type="submit">Search</button>
        {(query || license || tool || tag || sort) && <a className="button secondary" href="/">Clear</a>}
      </form>
      {projects.length ? <div className="grid">{projects.map((project) => <a className="card" href={`/projects/${project.slug}`} key={project.id}>
        <img src={publicAssetUrl(project.coverUrl)} alt="" />
        <div className="card-content"><h3>{project.title}</h3><p className="meta">{project.owner.name} · {project.license}</p><p>{project.description}</p></div>
      </a>)}</div> : <p className="meta">No public projects match those filters.</p>}
    </section>
  </>;
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
