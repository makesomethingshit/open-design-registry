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
    include: { revisions: { select: { id: true } } },
  });
  return <section><div className="page-heading"><div><p className="meta">WORKSPACE</p><h1>내 프로젝트</h1><p className="lede">공개·비공개 프로젝트와 Revision을 관리하세요.</p></div><Link className="button" href="/projects/new">프로젝트 만들기</Link></div>{projects.length ? <div className="grid">{projects.map((project) => <Link className="card" href={`/projects/${project.slug}`} key={project.id}><img src={publicAssetUrl(project.coverUrl)} alt="" /><div className="card-content"><div className="project-card-heading"><h2>{project.title}</h2><span className={`visibility ${project.isPublic ? "public" : "private"}`}>{project.isPublic ? "공개" : "비공개"}</span></div><p className="meta">{project.revisions.length}개 Revision · {project.license}</p><p>{project.description || "설명이 없습니다."}</p></div></Link>)}</div> : <div className="empty-state"><p>아직 프로젝트가 없습니다.</p><Link className="button" href="/projects/new">첫 프로젝트 만들기</Link></div>}</section>;
}
