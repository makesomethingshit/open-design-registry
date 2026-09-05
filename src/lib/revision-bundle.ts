import { createHash } from "node:crypto";
import { getObject, putBytes } from "./storage";

export type RevisionBundleFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  assetKey: string;
  previewKeys: string[];
};

export type RevisionBundle = { version: 1; files: RevisionBundleFile[] };

function isBundleFile(value: unknown): value is RevisionBundleFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return ["id", "name", "mimeType", "assetKey"].every((key) => typeof file[key] === "string" && file[key])
    && typeof file.size === "number" && Number.isInteger(file.size) && file.size >= 0
    && Array.isArray(file.previewKeys) && file.previewKeys.every((key) => typeof key === "string" && key);
}

function normalize(bundle: RevisionBundle): RevisionBundle | null {
  if (bundle.version !== 1 || !Array.isArray(bundle.files) || !bundle.files.length || !bundle.files.every(isBundleFile)) return null;
  const ids = new Set(bundle.files.map((file) => file.id));
  return ids.size === bundle.files.length ? bundle : null;
}

export function encodeRevisionBundle(bundle: RevisionBundle) {
  const normalized = normalize(bundle);
  if (!normalized) throw new Error("Invalid revision bundle");
  return Buffer.from(JSON.stringify(normalized));
}

export function revisionBundleChecksum(bundle: RevisionBundle) {
  return createHash("sha256").update(encodeRevisionBundle(bundle)).digest("hex");
}

export async function readRevisionBundle(sourceKey?: string | null): Promise<RevisionBundle | null> {
  if (!sourceKey) return null;
  try {
    const object = await getObject(sourceKey);
    if (!object.Body || (object.ContentLength ?? 0) > 1024 * 1024) return null;
    const body = object.Body as { transformToString?: (encoding?: string) => Promise<string> } | undefined;
    if (!body?.transformToString) return null;
    const parsed = JSON.parse(await body.transformToString("utf8")) as RevisionBundle;
    return normalize(parsed);
  } catch {
    return null;
  }
}

export async function putRevisionBundle(key: string, bundle: RevisionBundle) {
  const body = encodeRevisionBundle(bundle);
  await putBytes(body, key, "application/vnd.open-design-registry.bundle+json");
  return { checksum: createHash("sha256").update(body).digest("hex") };
}

export function publicBundleFiles(bundle: RevisionBundle | null) {
  return bundle?.files.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })) ?? [];
}
