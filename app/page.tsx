import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await prisma.project.findMany({ where: { isPublic: true }, orderBy: { createdAt: "desc" }, take: 24, include: { owner: { select: { name: true } } } });
  return <><section className="hero"><p className="meta">TOOL-NEUTRAL DESIGN REGISTRY</p><h1>Make it open.</h1><p className="lede">원본 도구와 상관없이, 누구나 보고 이어갈 수 있는 디자인 프로젝트를 공개하세요.</p><a className="button" href="/projects/new">프로젝트 만들기</a></section><section><h2>공개 프로젝트</h2>{projects.length ? <div className="grid">{projects.map((project) => <a className="card" href={`/projects/${project.slug}`} key={project.id}><img src={project.coverUrl} alt="" /><div className="card-content"><h3>{project.title}</h3><p className="meta">{project.owner.name} · {project.license}</p><p>{project.description}</p></div></a>)}</div> : <p className="meta">아직 공개된 프로젝트가 없습니다.</p>}</section></>;
}
