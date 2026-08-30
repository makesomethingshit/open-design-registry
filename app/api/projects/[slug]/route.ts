import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { projectUpdateSchema } from "@/src/lib/project-validation";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, include: { owner: { select: { name: true } } } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const session = await getSession();
  if (!project.isPublic && session?.user.id !== project.ownerId) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (session.user.id !== project.ownerId) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: project.isPublic ? 403 : 404 });
  const parsed = projectUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data).length) return NextResponse.json({ error: "변경할 값을 확인하세요." }, { status: 400 });
  return NextResponse.json(await prisma.project.update({ where: { slug }, data: parsed.data }));
}
