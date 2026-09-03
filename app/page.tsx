import { prisma } from "@/src/lib/prisma";
import { publicAssetUrl } from "@/src/lib/storage";

export const dynamic = "force-dynamic";

const licenseOptions = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "MIT"];

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = firstValue(params.q);
  const license = firstValue(params.license);
  const sort = firstValue(params.sort) === "recent" ? "recent" : "";
  const projects = await prisma.project.findMany({
    where: {
      isPublic: true,
      ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] } : {}),
      ...(license ? { license } : {}),
    },
    orderBy: sort === "recent" ? { updatedAt: "desc" } : { createdAt: "desc" },
    take: 24,
    include: { owner: { select: { name: true } } },
  });
  return <><section className="hero"><p className="meta">TOOL-NEUTRAL DESIGN REGISTRY</p><h1>Make it open.</h1><p className="lede">원본 도구와 상관없이, 누구나 보고 이어갈 수 있는 디자인 프로젝트를 공개하세요.</p><a className="button" href="/projects/new">프로젝트 만들기</a></section><section aria-labelledby="public-projects-heading"><h2 id="public-projects-heading">공개 프로젝트</h2><form className="project-filters" method="get" action="/"><label>제목·설명 검색<input name="q" type="search" defaultValue={query} placeholder="프로젝트를 검색하세요" /></label><label>라이선스<select name="license" defaultValue={license}><option value="">모든 라이선스</option>{licenseOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label><label>정렬<select name="sort" defaultValue={sort}><option value="">최근 생성순</option><option value="recent">최근 활동순</option></select></label><button className="button" type="submit">검색</button>{(query || license || sort) && <a className="button secondary" href="/">초기화</a>}</form>{projects.length ? <div className="grid">{projects.map((project) => <a className="card" href={`/projects/${project.slug}`} key={project.id}><img src={publicAssetUrl(project.coverUrl)} alt="" /><div className="card-content"><h3>{project.title}</h3><p className="meta">{project.owner.name} · {project.license}</p><p>{project.description}</p></div></a>)}</div> : <p className="meta">조건에 맞는 공개 프로젝트가 없습니다.</p>}</section></>;
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
