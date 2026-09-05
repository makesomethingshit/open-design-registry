import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { toPublicRevision } from "@/src/lib/revisions";
import { deleteObject, putObject } from "@/src/lib/storage";
import { pageCursor, paginationRequested, parsePageSize } from "@/src/lib/pagination";
import {
  maxRevisionPreviewBytes,
  maxRevisionPreviewTotalBytes,
  maxRevisionPreviews,
  maxRevisionSourceBytes,
  previewAltText,
  previewTypes,
  parseRevisionTags,
  revisionSourceChecksum,
  revisionTool,
  revisionToolVersion,
  revisionChangeDescription,
  revisionTitle,
  validateRevisionSource,
} from "@/src/lib/project-validation";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true, isPublic: true } });
  if (!project) return error("Project not found", 404);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!project.isPublic && session?.user.id !== project.ownerId) return error("Project not found", 404);
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  const license = searchParams.get("license")?.trim() ?? "";
  const tool = ((searchParams.get("tool") ?? searchParams.get("toolName"))?.trim() ?? "").toLowerCase();
  const tags = [...new Set(searchParams.getAll("tag").concat(searchParams.getAll("tags").flatMap((value) => value.split(",")).filter(Boolean)).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const sort = searchParams.get("sort")?.trim() ?? "";
  const isPaginated = paginationRequested(searchParams);
  const limit = parsePageSize(searchParams.get("limit") ?? searchParams.get("take") ?? searchParams.get("pageSize"));
  const cursor = pageCursor(searchParams.get("cursor"));
  const orderBy = sort === "recent"
    ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
    : sort === "oldest"
      ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
      : [{ number: "asc" as const }];
  const filters = [
    { projectId: project.id, isPublished: true },
    ...(query ? [{ OR: [{ title: { contains: query, mode: "insensitive" as const } }, { changeDescription: { contains: query, mode: "insensitive" as const } }, { tool: { contains: query, mode: "insensitive" as const } }, { toolVersion: { contains: query, mode: "insensitive" as const } }, { tags: { hasEvery: [query.toLowerCase()] } }] }] : []),
    ...(license ? [{ license }] : []),
    ...(tool ? [{ tool: { equals: tool } }] : []),
    ...(tags.length ? [{ tags: { hasEvery: tags } }] : []),
  ];
  const revisions = await prisma.revision.findMany({
    where: filters.length === 1 ? filters[0] : { AND: filters },
    ...(isPaginated ? { cursor: cursor ? { id: cursor } : undefined, skip: cursor ? 1 : undefined, take: limit + 1 } : { take: limit + 1 }),
    orderBy,
    include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } },
  });
  const hasMore = revisions.length > limit;
  const page = revisions.slice(0, limit).map(toPublicRevision);
  if (!isPaginated) {
    const response = NextResponse.json(page);
    response.headers.set("X-Has-More", String(hasMore));
    if (hasMore) response.headers.set("X-Next-Cursor", revisions[limit - 1]?.id ?? "");
    return response;
  }
  return NextResponse.json({ items: page, nextCursor: hasMore ? revisions[limit - 1]?.id ?? null : null });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return error("Sign-in required", 401);
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, ownerId: true } });
  if (!project) return error("Project not found", 404);
  if (project.ownerId !== session.user.id) return error("Only the project owner can publish revisions", 403);

  const form = await request.formData();
  const titleResult = revisionTitle.safeParse(form.get("title"));
  if (!titleResult.success) return error("Revision title is required and must be 120 characters or fewer");
  const title = titleResult.data;
  const changeDescriptionValue = form.get("changeDescription") ?? form.get("description");
  const descriptionResult = revisionChangeDescription.safeParse(typeof changeDescriptionValue === "string" ? changeDescriptionValue : "");
  if (!descriptionResult.success) return error("Change description is required and must be 500 characters or fewer");
  const changeDescription = descriptionResult.data;
  const toolValue = form.get("tool") ?? form.get("toolName");
  const toolResult = toolValue == null || (typeof toolValue === "string" && !toolValue.trim()) ? { success: true as const, data: undefined } : revisionTool.safeParse(toolValue);
  if (!toolResult.success) return error("Tool name is required and must be 80 characters or fewer");
  const toolVersionValue = form.get("toolVersion");
  const toolVersionResult = toolVersionValue == null || (typeof toolVersionValue === "string" && !toolVersionValue.trim()) ? { success: true as const, data: undefined } : revisionToolVersion.safeParse(toolVersionValue);
  if (!toolVersionResult.success) return error("Tool version must be 80 characters or fewer");
  const tool = toolResult.data?.toLowerCase();
  if (toolVersionResult.data && !tool) return error("Provide a tool name with the tool version");
  const tagResult = parseRevisionTags(form.getAll("tags").concat(form.getAll("tag")));
  if ("error" in tagResult) return error(tagResult.error ?? "Invalid tags");
  const checksumValue = ["sourceChecksum", "checksum", "sourceHash"].map((name) => form.get(name)).find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
  const checksumResult = checksumValue ? revisionSourceChecksum.safeParse(checksumValue) : { success: true as const, data: undefined };
  if (!checksumResult.success) return error("Source checksum must be a 64-character SHA-256 hex digest");
  let sourceChecksum = checksumResult.data?.toLowerCase();
  const sourceEntry = form.get("source");
  const sourceFile = sourceEntry instanceof File && sourceEntry.name.trim() ? sourceEntry : undefined;
  const sourceUrlValue = form.get("sourceUrl");
  const sourceKeyValue = form.get("sourceKey");
  const sourceUrl = typeof sourceUrlValue === "string" && sourceUrlValue.trim() ? sourceUrlValue.trim() : undefined;
  const sourceError = validateRevisionSource({ hasFile: Boolean(sourceFile), sourceUrl, sourceKey: typeof sourceKeyValue === "string" ? sourceKeyValue : undefined });
  if (sourceError) return error(sourceError);
  if (sourceFile && sourceFile.size > maxRevisionSourceBytes) return error("Source file exceeds the 100MB limit");
  if (sourceFile) {
    const computedChecksum = createHash("sha256").update(new Uint8Array(await sourceFile.arrayBuffer())).digest("hex");
    if (sourceChecksum && sourceChecksum !== computedChecksum) return error("Source checksum does not match the uploaded file");
    sourceChecksum = computedChecksum;
  }

  const previews = [...form.getAll("previews"), ...form.getAll("preview")].filter((value): value is File => value instanceof File);
  if (!previews.length || previews.length > maxRevisionPreviews) return error(`Provide 1-${maxRevisionPreviews} PNG/JPG/HTML previews`);
  const altTextValues = ["altTexts", "previewAltTexts", "altText"].flatMap((name) => form.getAll(name));
  if (altTextValues.length !== previews.length) return error("Provide one alt text for each preview");
  const altTexts: string[] = [];
  for (const value of altTextValues) {
    const result = previewAltText.safeParse(value);
    if (!result.success) return error("Each preview alt text is required and must be 500 characters or fewer");
    altTexts.push(result.data);
  }
  const totalPreviewBytes = previews.reduce((total, file) => total + file.size, 0);
  if (previews.some((file) => !previewTypes.has(file.type) || file.size > maxRevisionPreviewBytes)) return error("Previews must be PNG/JPG/HTML files no larger than 10MB each");
  if (totalPreviewBytes > maxRevisionPreviewTotalBytes) return error("Preview quota exceeded (50MB total)");

  const uploadedKeys: string[] = [];
  try {
    let publishedSourceKey: string | undefined;
    if (sourceFile) {
      publishedSourceKey = `revisions/${project.id}/${crypto.randomUUID()}/source-${safeName(sourceFile.name)}`;
      await putObject(sourceFile, publishedSourceKey);
      uploadedKeys.push(publishedSourceKey);
    }
    const uploadedPreviews = [] as Array<{ key: string; url: string; mimeType: string; size: number; position: number; altText: string }>;
    for (const [index, file] of previews.entries()) {
      const key = `revisions/${project.id}/${crypto.randomUUID()}/preview-${index}-${safeName(file.name)}`;
      const url = await putObject(file, key);
      uploadedKeys.push(key);
      uploadedPreviews.push({ key, url, mimeType: file.type, size: file.size, position: index, altText: altTexts[index] });
    }

    const revision = await prisma.$transaction(async (tx) => {
      const [lockedProject] = await tx.$queryRaw<Array<{ license: string }>>`SELECT license FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
      if (!lockedProject) throw new PublishError("Project not found", 404);
      const latest = await tx.revision.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" } });
      const requestedParent = form.get("parentId");
      const parentId = typeof requestedParent === "string" && requestedParent.trim() ? requestedParent.trim() : latest?.id;
      if ((latest && parentId !== latest.id) || (!latest && parentId)) throw new PublishError("parentId must be the latest revision", 409);
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: project.id, number: (latest?.number ?? 0) + 1, parentId, title,
          changeDescription,
          license: lockedProject.license,
          sourceKey: publishedSourceKey, sourceUrl,
          tool,
          toolVersion: toolVersionResult.data,
          tags: tagResult.tags,
          sourceChecksum,
          isPublished: false,
          previews: { create: uploadedPreviews },
        },
      });
      return tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, include: { previews: true } });
    });
    return NextResponse.json(toPublicRevision(revision), { status: 201 });
  } catch (cause) {
    await Promise.allSettled(uploadedKeys.map((key) => deleteObject(key)));
    if (cause instanceof PublishError) return error(cause.message, cause.status);
    console.error("revision publish failed", cause);
    return error("Revision could not be published", 500);
  }
}

class PublishError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "file";
}
