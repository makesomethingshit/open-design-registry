import { NextResponse } from "next/server";
import { auth } from "@/src/lib/auth";
import { prisma } from "@/src/lib/prisma";
import { assetUrl, getObject, legacyObjectUrl } from "@/src/lib/storage";

const bucket = process.env.S3_BUCKET ?? "open-design-registry";

function notFound() {
  return NextResponse.json({ error: "Asset not found" }, { status: 404 });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const requestedKey = query.get("key")?.trim();
  const requestedUrl = query.get("url")?.trim();
  const key = requestedKey || keyFromLegacyUrl(requestedUrl);
  if (!key || !safeKey(key)) return notFound();

  const storedUrls = new Set<string>(requestedUrl ? [requestedUrl] : []);
  if (requestedKey) [assetUrl(key), legacyObjectUrl(key), key].forEach((value) => storedUrls.add(value));

  const session = await auth.api.getSession({ headers: request.headers });
  const [projects, previews, revisions] = await Promise.all([
    prisma.project.findMany({ where: { coverUrl: { in: [...storedUrls] } }, select: { isPublic: true, ownerId: true } }),
    prisma.preview.findMany({
      where: { OR: [{ key }, { url: { in: [...storedUrls] } }] },
      select: { revision: { select: { project: { select: { isPublic: true, ownerId: true } } } } },
    }),
    prisma.revision.findMany({ where: { sourceKey: key }, select: { project: { select: { isPublic: true, ownerId: true } } } }),
  ]);
  const owners = [
    ...projects,
    ...previews.map(({ revision }) => revision.project),
    ...revisions.map(({ project }) => project),
  ];
  if (!owners.some((project) => project.isPublic || project.ownerId === session?.user.id)) return notFound();

  try {
    const object = await getObject(key);
    if (!object.Body) return notFound();
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    if (object.ContentType) headers.set("Content-Type", object.ContentType);
    if (object.ContentLength !== undefined) headers.set("Content-Length", String(object.ContentLength));
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
