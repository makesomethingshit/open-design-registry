import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { getSession } from "@/src/lib/session";
import { imageTypes, maxImageBytes, projectSchema, slugify } from "@/src/lib/project-validation";
import { deleteObject, publicAssetUrl, putCover } from "@/src/lib/storage";
import { pageCursor, paginationRequested, parsePageSize } from "@/src/lib/pagination";

export async function GET(request: Request) {
  const session = await getSession();
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const license = params.get("license")?.trim() ?? "";
  const tool = ((params.get("tool") ?? params.get("toolName"))?.trim() ?? "").toLowerCase();
  const tags = [...new Set(params.getAll("tag").concat(params.getAll("tags").flatMap((value) => value.split(",")).filter(Boolean)).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const sort = params.get("sort")?.trim() ?? "";
  const isPaginated = paginationRequested(params);
  const limit = parsePageSize(params.get("limit") ?? params.get("take") ?? params.get("pageSize"));
  const cursor = pageCursor(params.get("cursor"));
  const visibility = session?.user ? { OR: [{ isPublic: true }, { ownerId: session.user.id }] } : { isPublic: true };
  const revisionFilter = tool || tags.length ? { revisions: { some: { ...(tool ? { tool: { equals: tool } } : {}), ...(tags.length ? { tags: { hasEvery: tags } } : {}) } } } : undefined;
  const filters = [
    ...(query ? [{ OR: [{ title: { contains: query, mode: "insensitive" as const } }, { description: { contains: query, mode: "insensitive" as const } }] }] : []),
    ...(license ? [{ license }] : []),
    ...(revisionFilter ? [revisionFilter] : []),
  ];
  const where = filters.length ? { AND: [visibility, ...filters] } : visibility;
  const projects = await prisma.project.findMany({
    where,
    ...(isPaginated ? { cursor: cursor ? { slug: cursor } : undefined, skip: cursor ? 1 : undefined, take: limit + 1 } : { take: limit + 1 }),
    orderBy: isPaginated
      ? (sort === "recent" ? [{ updatedAt: "desc" }, { slug: "desc" }] : sort === "oldest" ? [{ createdAt: "asc" }, { slug: "asc" }] : [{ createdAt: "desc" }, { slug: "desc" }])
      : (sort === "recent" ? { updatedAt: "desc" } : sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" }),
    select: { slug: true, title: true, description: true, license: true, isPublic: true, coverUrl: true, createdAt: true, owner: { select: { name: true } } },
  });
  const hasMore = projects.length > limit;
  const page = projects.slice(0, limit).map((project) => ({ ...project, coverUrl: publicAssetUrl(project.coverUrl) }));
  if (!isPaginated) {
    const response = NextResponse.json(page);
    response.headers.set("X-Has-More", String(hasMore));
    if (hasMore) response.headers.set("X-Next-Cursor", projects[limit - 1]?.slug ?? "");
    return response;
  }
  return NextResponse.json({ items: page, nextCursor: hasMore ? projects[limit - 1]?.slug ?? null : null });
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
