import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { assetUrl, getObject, legacyObjectUrl } from "@/src/lib/storage";
import { documentImageProjectId } from "@/src/lib/project-document-images";
import { renderProjectDocument } from "@/src/lib/project-document";
import { readCanvasAsset } from "@/src/lib/canvas/items";

const bucket = process.env.S3_BUCKET ?? "open-design-registry";

function notFound() {
  return NextResponse.json({ error: "Asset not found" }, { status: 404 });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const hasKey = query.has("key");
  const hasUrl = query.has("url");
  if (hasKey === hasUrl) return notFound();
  const requestedKey = query.get("key")?.trim();
  const requestedUrl = query.get("url")?.trim();
  const key = requestedKey || keyFromLegacyUrl(requestedUrl);
  if (!key || !safeKey(key)) return notFound();
  // A moderation block overrides every public or owner reference to this key.
  // Check before resolving ownership, so different project URLs cannot bypass it.
  const moderated = await prisma.moderationAssetBlock.findFirst({
    where: { key, blocked: true },
    select: { key: true },
  });
  if (moderated) return notFound();

  const storedUrls = new Set<string>([assetUrl(key), legacyObjectUrl(key), key, ...(hasUrl ? [requestedUrl!] : [])]);

  const session = await auth.api.getSession({ headers: request.headers });
  if (key.startsWith("canvas-items/")) {
    try {
      const object = await readCanvasAsset(key, session?.user.id ?? null);
      return object ? new NextResponse(object.bytes as unknown as BodyInit, { headers: { "Content-Type": object.contentType, "Content-Length": String(object.bytes.byteLength), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }) : notFound();
    } catch { return notFound(); }
  }
  const imageProjectId = documentImageProjectId(key);
  const [projects, previews, revisions, documentProject] = await Promise.all([
    prisma.project.findMany({ where: { coverUrl: { in: [...storedUrls] } }, select: { isPublic: true, ownerId: true } }),
    prisma.preview.findMany({
      where: { OR: [{ key }, { url: { in: [...storedUrls] } }] },
      select: { revision: { select: { project: { select: { isPublic: true, ownerId: true } } } } },
    }),
    prisma.revision.findMany({ where: { sourceKey: key }, select: { project: { select: { isPublic: true, ownerId: true } } } }),
    imageProjectId ? prisma.project.findUnique({ where: { id: imageProjectId }, select: { isPublic: true, ownerId: true, document: true } }) : Promise.resolve(null),
  ]);
  const owners = imageProjectId ? (documentProject ? [{
    ownerId: documentProject.ownerId,
    isPublic: documentProject.isPublic && renderProjectDocument(documentProject.document).includes(`<img src="${assetUrl(key)}"`),
  }] : []) : [
    ...projects,
    ...previews.map(({ revision }) => revision.project),
    ...revisions.map(({ project }) => project),
  ];
  if (!owners.some((project) => project.isPublic || project.ownerId === session?.user.id)) return notFound();

  try {
    const object = await getObject(key);
    if (!object.Body) return notFound();
    const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (object.ContentType) headers.set("Content-Type", object.ContentType);
    if (object.ContentType?.split(";", 1)[0].trim().toLowerCase() === "text/html") {
      headers.set("Content-Security-Policy", "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https:; img-src data: https:; font-src data: https:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'");
    }
    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
    if (revisions.length) headers.set("Content-Disposition", "attachment");
    const body = object.Body as typeof object.Body & { transformToWebStream?: () => ReadableStream };
    return new NextResponse(body.transformToWebStream ? body.transformToWebStream() : body as unknown as BodyInit, { headers });
  } catch {
    return notFound();
  }
}

function safeKey(key: string) {
  return key.length <= 1024 && !key.startsWith("/") && !key.split("/").includes("..");
}

function keyFromLegacyUrl(value: string | undefined) {
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  try {
    const url = new URL(value);
    const endpoint = process.env.S3_ENDPOINT;
    if (endpoint) {
      const configured = new URL(endpoint);
      if (url.origin !== configured.origin) return undefined;
      const endpointPath = configured.pathname.replace(/^\/+|\/+$/g, "");
      const prefix = [endpointPath, bucket].filter(Boolean).join("/");
      const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : undefined;
    }
    const region = process.env.S3_REGION ?? "us-east-1";
    if (url.hostname.toLowerCase() !== `${bucket}.s3.${region}.amazonaws.com`) return undefined;
    return decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    return undefined;
  }
}
