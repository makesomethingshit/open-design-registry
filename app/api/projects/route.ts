import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { imageTypes, maxImageBytes, projectSchema, slugify } from "@/src/lib/project-validation";
import { deleteObject, publicAssetUrl, putCover } from "@/src/lib/storage";

export async function GET(request: Request) {
  const session = await getSession();
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const license = params.get("license")?.trim() ?? "";
  const visibility = session?.user ? { OR: [{ isPublic: true }, { ownerId: session.user.id }] } : { isPublic: true };
  const where = query || license ? { AND: [visibility, ...(query ? [{ OR: [{ title: { contains: query, mode: "insensitive" as const } }, { description: { contains: query, mode: "insensitive" as const } }] }] : []), ...(license ? [{ license }] : [])] } : visibility;
  const projects = await prisma.project.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { slug: true, title: true, description: true, license: true, isPublic: true, coverUrl: true, createdAt: true, owner: { select: { name: true } } },
  });
  return NextResponse.json(projects.map((project) => ({ ...project, coverUrl: publicAssetUrl(project.coverUrl) })));
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const form = await request.formData();
  const parsed = projectSchema.safeParse({
    title: form.get("title"), description: form.get("description") ?? "", license: form.get("license"), isPublic: form.get("isPublic") === "on" || form.get("isPublic") === "true",
  });
  const rightsConfirmed = form.get("rightsConfirmed") === "on" || form.get("rightsConfirmed") === "true";
  const cover = form.get("cover");
  if (!parsed.success || (parsed.data.isPublic && !rightsConfirmed) || !(cover instanceof File) || !imageTypes.has(cover.type) || cover.size > maxImageBytes) {
    return NextResponse.json({ error: "제목, 라이선스와 10MB 이하 PNG/JPG 대표 이미지를 확인하세요." }, { status: 400 });
  }
  const baseSlug = slugify(parsed.data.title);
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const coverKey = `covers/${session.user.id}/${slug}`;
  try {
    const coverUrl = await putCover(cover, coverKey);
    const project = await prisma.project.create({ data: { ...parsed.data, slug, coverUrl, ownerId: session.user.id, ...(parsed.data.isPublic ? { publicationConfirmedAt: new Date(), publicationConfirmedBy: session.user.id } : {}) } });
    return NextResponse.json({ ...project, coverUrl: publicAssetUrl(project.coverUrl) }, { status: 201 });
  } catch (cause) {
    await deleteObject(coverKey).catch(() => undefined);
    console.error("project creation failed", cause);
    return NextResponse.json({ error: "프로젝트를 만들지 못했습니다." }, { status: 500 });
  }
}
