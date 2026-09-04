import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { toPublicRevision } from "@/src/lib/revisions";
import { deleteObject, putObject } from "@/src/lib/storage";
import {
  maxRevisionPreviewBytes,
  maxRevisionPreviewTotalBytes,
  maxRevisionPreviews,
  maxRevisionSourceBytes,
  previewAltText,
  previewTypes,
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
  const revisions = await prisma.revision.findMany({
    where: { projectId: project.id }, orderBy: { number: "asc" }, include: { previews: { orderBy: [{ position: "asc" }, { key: "asc" }] } },
  });
  return NextResponse.json(revisions.map(toPublicRevision));
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
  const sourceEntry = form.get("source");
  const sourceFile = sourceEntry instanceof File && sourceEntry.name.trim() ? sourceEntry : undefined;
  const sourceUrlValue = form.get("sourceUrl");
  const sourceKeyValue = form.get("sourceKey");
  const sourceUrl = typeof sourceUrlValue === "string" && sourceUrlValue.trim() ? sourceUrlValue.trim() : undefined;
  const sourceError = validateRevisionSource({ hasFile: Boolean(sourceFile), sourceUrl, sourceKey: typeof sourceKeyValue === "string" ? sourceKeyValue : undefined });
  if (sourceError) return error(sourceError);
  if (sourceFile && sourceFile.size > maxRevisionSourceBytes) return error("Source file exceeds the 100MB limit");

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
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${project.id} FOR UPDATE`;
      const latest = await tx.revision.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" } });
      const requestedParent = form.get("parentId");
      const parentId = typeof requestedParent === "string" && requestedParent.trim() ? requestedParent.trim() : latest?.id;
      if ((latest && parentId !== latest.id) || (!latest && parentId)) throw new PublishError("parentId must be the latest revision", 409);
      const stagedRevision = await tx.revision.create({
        data: {
          projectId: project.id, number: (latest?.number ?? 0) + 1, parentId, title,
          changeDescription,
          sourceKey: publishedSourceKey, sourceUrl,
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
