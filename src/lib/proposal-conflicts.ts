import { sameDependencySet, type RevisionBundle, type RevisionBundleFile } from "./revision-bundle";

export type ConflictStatus = "NO_CONFLICT" | "CONFLICT" | "CHECK_UNAVAILABLE";

export type ConflictChange = {
  type: string;
  action: string | null;
  targetFileId: string | null;
};

export type ConflictResult = {
  status: ConflictStatus;
  reason: string;
};

const noConflict = (reason = "No upstream conflict."): ConflictResult => ({ status: "NO_CONFLICT", reason });
const conflict = (reason: string): ConflictResult => ({ status: "CONFLICT", reason });
const unavailable = (reason = "Check unavailable."): ConflictResult => ({ status: "CHECK_UNAVAILABLE", reason });

function metadataChanged(base: RevisionBundleFile, latest: RevisionBundleFile) {
  return base.name !== latest.name || base.kind !== latest.kind || base.size !== latest.size || base.mimeType !== latest.mimeType;
}

export function conflictForChange(change: ConflictChange, base: RevisionBundle | null, latest: RevisionBundle | null): ConflictResult | null {
  const action = change.action ?? change.type;
  if (action === "REPLACE_DOCUMENT") return null;
  if (!change.targetFileId || !base || !latest) return unavailable("Comparison data is unavailable.");
  const baseFile = base.files.find((file) => file.id === change.targetFileId);
  const latestFile = latest.files.find((file) => file.id === change.targetFileId);
  if (action === "ADD_UNIT") {
    if (!baseFile && !latestFile) return noConflict("New unit; ID is available.");
    return latestFile ? conflict("This unit ID is already present in the latest revision.") : conflict("Comparison data differs from the base revision.");
  }
  if (!baseFile) return unavailable("Comparison data is unavailable.");
  if (!latestFile) return conflict("This unit was removed from the latest revision.");
  if (!sameDependencySet(baseFile.dependencies, latestFile.dependencies)) return conflict("Unit dependencies changed upstream.");
  if (action === "RENAME_UNIT" && baseFile.name !== latestFile.name) return conflict("Unit name changed upstream.");
  if (baseFile.checksum && latestFile.checksum) {
    return baseFile.checksum === latestFile.checksum
      ? noConflict()
      : conflict("Source content changed upstream.");
  }
  if (Boolean(baseFile.checksum) !== Boolean(latestFile.checksum)) return conflict("Comparison data differs from the base revision.");
  return metadataChanged(baseFile, latestFile)
    ? conflict("Unit metadata changed upstream.")
    : unavailable();
}

export function renamedUnitIds(before: RevisionBundle, after: RevisionBundle, targetFileIds: string[] | null) {
  const previous = new Map(before.files.map((file) => [file.id, file]));
  const next = new Map(after.files.map((file) => [file.id, file]));
  const ids = targetFileIds ?? [...new Set([...previous.keys(), ...next.keys()])];
  return ids.filter((id) => {
    const left = previous.get(id);
    const right = next.get(id);
    return Boolean(left && right && left.name !== right.name);
  });
}

export function changedUnitIds(before: RevisionBundle, after: RevisionBundle, targetFileIds: string[] | null) {
  const previous = new Map(before.files.map((file) => [file.id, file]));
  const next = new Map(after.files.map((file) => [file.id, file]));
  const ids = targetFileIds ?? [...new Set([...previous.keys(), ...next.keys()])];
  return ids.filter((id) => {
    const left = previous.get(id);
    const right = next.get(id);
    if (!left || !right) return Boolean(left || right);
    return !sameDependencySet(left.dependencies, right.dependencies) || Boolean(left.checksum && right.checksum && left.checksum !== right.checksum);
  });
}
