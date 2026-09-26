import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { toPublicRevision } from "@/src/lib/revisions";
import { deleteObject, putObject } from "@/src/lib/storage";
import { suggestFile } from "@/src/lib/adapters";
import { capabilityForBundle, normalizeUnitKind, normalizeUnitName, putRevisionBundle, readRevisionBundle, type RevisionBundle } from "@/src/lib/revision-bundle";
import { pageCursor, paginationRequested, parsePageSize } from "@/src/lib/pagination";
import { validateRightsAgainstRevision, validateRightsSourceFilesInBundle } from "@/src/lib/revision-rights";
import { parseRightsDeclaration, type RightsDeclarationInput } from "@/src/lib/rights";
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
  let rightsInput: RightsDeclarationInput | null = null;
  const rightsValue = ["rightsManifest", "rights"].map((name) => form.get(name)).find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (rightsValue) {
    let rightsPayload: unknown;
    try {
      rightsPayload = JSON.parse(rightsValue);
    } catch {
      return error("Rights declaration is invalid");
    }
    const rightsResult = parseRightsDeclaration(rightsPayload);
    if ("error" in rightsResult) return error("Rights declaration is invalid");
    rightsInput = rightsResult.data;
  }
  const checksumValue = ["sourceChecksum", "checksum", "sourceHash"].map((name) => form.get(name)).find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
  const checksumResult = checksumValue ? revisionSourceChecksum.safeParse(checksumValue) : { success: true as const, data: undefined };
  if (!checksumResult.success) return error("Source checksum must be a 64-character SHA-256 hex digest");
  let sourceChecksum = checksumResult.data?.toLowerCase();
  const sourceFiles = [...form.getAll("sources"), ...form.getAll("source")].filter((value): value is File => value instanceof File && Boolean(value.name.trim()));
  if (sourceFiles.length > 10) return error("Provide no more than 10 source files");
  const sourceFileIds = form.getAll("sourceFileIds");
  if (sourceFileIds.length && sourceFileIds.length !== sourceFiles.length) return error("Provide one existing file ID for each uploaded source file");
  const mappedSourceFileIds = sourceFiles.map((_, index) => {
    const value = sourceFileIds[index];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  });
  const sourceBundleFileIds = form.getAll("sourceBundleFileIds");
  if (sourceBundleFileIds.length && sourceBundleFileIds.length !== sourceFiles.length) return error("Provide one bundle file ID for each uploaded source file");
  const requestedBundleFileIds = sourceFiles.map((_, index) => {
    const value = sourceBundleFileIds[index];
    return typeof value === "string" && value.trim() ? value.trim() : crypto.randomUUID();
  });
  if (new Set(requestedBundleFileIds).size !== requestedBundleFileIds.length) return error("Each source file must have a unique bundle file ID");
  const sourceDependencies = form.getAll("sourceDependencies");
  if (sourceDependencies.length && sourceDependencies.length !== sourceFiles.length) return error("Provide one dependency list for each uploaded source file");
  const finalBundleFileIds = sourceFiles.map((_, index) => mappedSourceFileIds[index] ?? requestedBundleFileIds[index]);
  let requestedDependencies: string[][] | undefined;
  if (sourceDependencies.length) {
    try {
      requestedDependencies = sourceDependencies.map((value, index) => {
        if (typeof value !== "string") throw new Error();
        const dependencies = JSON.parse(value) as unknown;
        if (!Array.isArray(dependencies) || dependencies.some((id) => typeof id !== "string" || !id || id === finalBundleFileIds[index]) || new Set(dependencies).size !== dependencies.length || dependencies.some((id) => !finalBundleFileIds.includes(id))) throw new Error();
        return dependencies as string[];
      });
    } catch {
      return error("Source dependencies are invalid");
    }
  }
  const sourceKinds = form.getAll("sourceKinds");
  if (sourceFiles.length && sourceKinds.length !== sourceFiles.length) return error("Select a kind for each source file");
  const requestedSourceKinds = sourceFiles.map((_, index) => typeof sourceKinds[index] === "string" ? normalizeUnitKind(sourceKinds[index] as string) : null);
  const sourceKindModes = form.getAll("sourceKindModes");
  if (sourceKindModes.length && sourceKindModes.length !== sourceFiles.length) return error("Provide one kind selection for each source file");
  const requestedKindModes = sourceFiles.map((_, index) => sourceKindModes[index]);
  if (requestedKindModes.some((mode) => mode != null && mode !== "auto" && mode !== "manual" && mode !== "preserved")) return error("Source kind selection is invalid");
  const sourceSuggestions = await Promise.all(sourceFiles.map(async (file) => {
    try {
      const result = await suggestFile(file);
      return result.status === "available" && result.suggestion.confidence !== "not_assessed" ? result.suggestion : null;
    } catch {
      return null;
    }
  }));
  if (requestedKindModes.some((mode, index) => mode === "auto" && (!requestedSourceKinds[index] || sourceSuggestions[index]?.kind !== requestedSourceKinds[index]))) return error("The suggested kind is no longer available");
  const sourceNames = sourceFiles.map((file) => normalizeUnitName(file.name));
  if (sourceNames.some((name) => !name)) return error("Each source file name must be 200 characters or fewer");
  const sourcePreviewIndexes = form.getAll("sourcePreviewIndexes");
  if ((!sourceFiles.length && sourcePreviewIndexes.length) || (sourceFiles.length > 1 && sourcePreviewIndexes.length !== sourceFiles.length) || (sourceFiles.length === 1 && sourcePreviewIndexes.length > 1)) return error("Provide one preview mapping for each source file");
  const sourceUrlValue = form.get("sourceUrl");
  const sourceKeyValue = form.get("sourceKey");
  const sourceUrl = typeof sourceUrlValue === "string" && sourceUrlValue.trim() ? sourceUrlValue.trim() : undefined;
  const sourceError = validateRevisionSource({ hasFile: Boolean(sourceFiles.length), sourceUrl, sourceKey: typeof sourceKeyValue === "string" ? sourceKeyValue : undefined });
  if (sourceError) return error(sourceError);
  if (sourceFiles.reduce((total, file) => total + file.size, 0) > maxRevisionSourceBytes) return error("Source files exceed the 100MB total limit");
  if (sourceFiles.length > 1 && sourceChecksum) return error("Source checksum is only supported for a single source file");
  if (sourceFiles.length === 1) {
    const computedChecksum = createHash("sha256").update(new Uint8Array(await sourceFiles[0].arrayBuffer())).digest("hex");
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
  const previewMappings = sourceFiles.length === 1 && !sourcePreviewIndexes.length
    ? [previews.map((_, index) => index)]
    : sourcePreviewIndexes.map((value) => [typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN]);
  if (previewMappings.some((indexes) => indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= previews.length))) return error("Each source file must map to an uploaded preview");

  const uploadedKeys: string[] = [];
  try {
    let publishedSourceKey: string | undefined;
    const sourceAssets: Array<{ file: File; key: string; checksum: string }> = [];
    for (const [index, file] of sourceFiles.entries()) {
      const key = `revisions/${project.id}/${crypto.randomUUID()}/source-${index}-${safeName(file.name)}`;
      await putObject(file, key);
      uploadedKeys.push(key);
      sourceAssets.push({ file, key, checksum: createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex") });
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
      if (rightsInput) {
        const rightsContextError = validateRightsAgainstRevision(lockedProject, rightsInput);
        if (rightsContextError) throw new PublishError(rightsContextError, 400);
      }
      const latest = await tx.revision.findFirst({ where: { projectId: project.id, isPublished: true }, orderBy: { number: "desc" } });
      const requestedParent = form.get("parentId");
      const parentId = typeof requestedParent === "string" && requestedParent.trim() ? requestedParent.trim() : latest?.id;
      if ((latest && parentId !== latest.id) || (!latest && parentId)) throw new PublishError("parentId must be the latest revision", 409);
      let capabilityMode: "STRUCTURED" | "WHOLE_DOCUMENT" = "WHOLE_DOCUMENT";
      let capabilityUnitCount = 0;
      if (sourceAssets.length) {
        const preservedIds = mappedSourceFileIds.filter((id): id is string => Boolean(id));
        if (new Set(preservedIds).size !== preservedIds.length) throw new PublishError("Each existing file can be mapped only once", 400);
        const latestBundle = preservedIds.length ? await readRevisionBundle(latest?.sourceKey) : null;
        if (preservedIds.length && (!latestBundle || preservedIds.some((id) => !latestBundle.files.some((file) => file.id === id)))) throw new PublishError("An existing file mapping is no longer available", 409);
        const bundle: RevisionBundle = {
          version: requestedDependencies ? 3 : 2,
          files: sourceAssets.map(({ file, key, checksum }, index) => {
            const previous = mappedSourceFileIds[index] ? latestBundle?.files.find((candidate) => candidate.id === mappedSourceFileIds[index]) : undefined;
            const kind = previous?.kind ?? requestedSourceKinds[index];
            if (!kind) throw new PublishError("Select a kind for each source file", 400);
            return {
              id: mappedSourceFileIds[index] ?? requestedBundleFileIds[index],
              name: sourceNames[index]!,
              kind,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              assetKey: key,
              previewKeys: previewMappings[index].map((previewIndex) => uploadedPreviews[previewIndex].key),
              checksum,
              ...(requestedDependencies ? { dependencies: requestedDependencies[index] } : {}),
            };
          }),
        };
        if (new Set(bundle.files.map((file) => file.id)).size !== bundle.files.length) throw new PublishError("Each final bundle file ID must be unique", 400);
        if (rightsInput) {
          const rightsSourceError = validateRightsSourceFilesInBundle(bundle, rightsInput.items);
          if (rightsSourceError) throw new PublishError(rightsSourceError, 400);
        }
        publishedSourceKey = `revisions/${project.id}/${crypto.randomUUID()}/bundle.json`;
        uploadedKeys.push(publishedSourceKey);
        const { checksum } = await putRevisionBundle(publishedSourceKey, bundle);
        sourceChecksum = checksum;
        const capability = capabilityForBundle(bundle);
        capabilityMode = capability.mode === "structured" ? "STRUCTURED" : "WHOLE_DOCUMENT";
        capabilityUnitCount = capability.unitCount;
      } else if (rightsInput) {
        const rightsSourceError = validateRightsSourceFilesInBundle(null, rightsInput.items);
        if (rightsSourceError) throw new PublishError(rightsSourceError, 400);
      }
      const adapter = sourceSuggestions.find((suggestion, index) => requestedKindModes[index] === "auto" && Boolean(suggestion));
      const adapterConfidence = adapter ? ({ high: "HIGH", medium: "MEDIUM", low: "LOW", not_assessed: "NOT_ASSESSED" } as const)[adapter.confidence] : undefined;
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: project.id, number: (latest?.number ?? 0) + 1, parentId, title,
          publishedById: session.user.id,
          changeDescription,
          license: lockedProject.license,
          sourceKey: publishedSourceKey, sourceUrl,
          tool,
          toolVersion: toolVersionResult.data,
          tags: tagResult.tags,
          sourceChecksum,
          capabilityMode,
          capabilityUnitCount,
          adapterId: adapter?.adapterId,
          adapterVersion: adapter?.adapterVersion,
          adapterConfidence,
          adapterMaturity: adapter?.maturity,
          isPublished: false,
          previews: { create: uploadedPreviews },
          ...(rightsInput ? {
            rightsDeclarations: {
              create: {
                version: 1,
                sourceRightsMode: rightsInput.sourceRightsMode,
                sourceLicenseName: rightsInput.sourceLicenseName,
                sourceLicenseUrl: rightsInput.sourceLicenseUrl,
                sourceRightsHolder: rightsInput.sourceRightsHolder,
                notes: rightsInput.notes,
                createdById: session.user.id,
                items: { create: rightsInput.items.map((item) => ({ ...item })) },
              },
            },
          } : {}),
        },
      });
      const published = await tx.revision.update({ where: { id: stagedRevision.id }, data: { isPublished: true }, include: { previews: true } });
      const watchers = await tx.projectWatch.findMany({ where: { projectId: project.id, userId: { not: session.user.id } }, select: { userId: true } });
      if (watchers.length) {
        await tx.notification.createMany({ data: watchers.map((watcher) => ({ recipientId: watcher.userId, actorId: session.user.id, type: "REVISION_PUBLISHED", projectId: project.id, revisionId: published.id })) });
      }
      return published;
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
