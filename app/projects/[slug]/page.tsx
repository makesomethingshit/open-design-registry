import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const project = await prisma.project.findUnique({ where: { slug }, include: { owner: { select: { name: true } } } });
  if (!project) notFound(); const session = await getSession(); if (!project.isPublic && session?.user.id !== project.ownerId) notFound();
  return <article className="detail"><p className="meta">{project.owner.name} · {project.license} · {project.isPublic ? "공개" : "비공개"}</p><h1>{project.title}</h1><p className="lede">{project.description}</p><img src={project.coverUrl} alt={`${project.title} 대표 이미지`} /></article>;
}
