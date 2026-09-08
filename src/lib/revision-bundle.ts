import { createHash } from "node:crypto";
import { getObject, putBytes } from "./storage";

export type RevisionBundleFile = {
  id: string;
  name: string;
  /** A v2 unit classification. Unknown strings are retained for forward compatibility. */
  kind?: string;
  mimeType: string;
  size: number;
  assetKey: string;
  previewKeys: string[];
  /** SHA-256 of the immutable source bytes. Absent on legacy bundles. */
  checksum?: string;
};

export type RevisionBundle = { version: 1 | 2; files: RevisionBundleFile[] };
export type RevisionUnit = Pick<RevisionBundleFile, "id" | "name" | "kind" | "mimeType" | "size" | "checksum">;
export type DetectedUnitChange = {
  action: "MODIFY_UNIT" | "RENAME_UNIT" | "REMOVE_UNIT" | "ADD_UNIT";
  targetFileId?: string;
  sourceFileId?: string;
  name: string;
  kind?: string;
  newName?: string;
};

export const unitKinds = ["artboard", "component", "asset", "token"] as const;
export type UnitKind = (typeof unitKinds)[number];
export type CapabilityMode = "structured" | "whole_document";

export function capabilityForBundle(bundle: RevisionBundle | null): { mode: CapabilityMode; unitCount: number } {
  return bundle ? { mode: "structured", unitCount: bundle.files.length } : { mode: "whole_document", unitCount: 0 };
}

export function detectUnitChanges(base: { files: readonly RevisionUnit[] } | null, source: { files: readonly RevisionUnit[] } | null): DetectedUnitChange[] {
  if (!base || !source) return [];
  const sourceById = new Map(source.files.map((file) => [file.id, file]));
  const changes: DetectedUnitChange[] = [];

  for (const target of base.files) {
    const sourceFile = sourceById.get(target.id);
    if (!sourceFile) {
      changes.push({ action: "REMOVE_UNIT", targetFileId: target.id, name: target.name, kind: target.kind });
    } else if (target.checksum && sourceFile.checksum && target.checksum !== sourceFile.checksum) {
      changes.push({ action: "MODIFY_UNIT", targetFileId: target.id, sourceFileId: sourceFile.id, name: target.name, kind: target.kind });
    } else if (target.name !== sourceFile.name) {
      changes.push({ action: "RENAME_UNIT", targetFileId: target.id, name: target.name, kind: target.kind, newName: sourceFile.name });
    }
  }

  const targetIds = new Set(base.files.map((file) => file.id));
  for (const sourceFile of source.files) {
    if (!targetIds.has(sourceFile.id) && sourceFile.kind) changes.push({ action: "ADD_UNIT", sourceFileId: sourceFile.id, name: sourceFile.name, kind: sourceFile.kind });
  }
  return changes;
}

export function sanitizeUnitName(value: string) {
  return value.trim().replace(/[\\/\"\u0000-\u001f\u007f]/g, "-").trim();
}

export function normalizeUnitName(value: string) {
  const name = sanitizeUnitName(value);
  return name && name.length <= 200 ? name : null;
}

export function normalizeUnitKind(value: string) {
  const kind = value.trim().toLowerCase();
  return (unitKinds as readonly string[]).includes(kind) ? kind as UnitKind : null;
}

function isBundleFile(value: unknown): value is RevisionBundleFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return ["id", "name", "mimeType", "assetKey"].every((key) => typeof file[key] === "string" && file[key])
    && typeof file.size === "number" && Number.isInteger(file.size) && file.size >= 0
    && Array.isArray(file.previewKeys) && file.previewKeys.every((key) => typeof key === "string" && key)
    && (file.kind === undefined || (typeof file.kind === "string" && Boolean(file.kind.trim())))
    && (file.checksum === undefined || (typeof file.checksum === "string" && /^[a-f0-9]{64}$/i.test(file.checksum)));
}

function normalize(bundle: RevisionBundle): RevisionBundle | null {
  if ((bundle.version !== 1 && bundle.version !== 2) || !Array.isArray(bundle.files) || !bundle.files.length || !bundle.files.every(isBundleFile)) return null;
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
  return bundle?.files.map(({ id, name, kind, mimeType, size }) => kind === undefined ? { id, name, mimeType, size } : { id, name, kind, mimeType, size }) ?? [];
}
