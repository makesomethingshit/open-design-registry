import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getObject: vi.fn(), putBytes: vi.fn() }));
vi.mock("./storage", () => ({ getObject: mocks.getObject, putBytes: mocks.putBytes }));

const { capabilityForBundle, dependencyClosure, detectUnitChanges, encodeRevisionBundle, normalizeUnitName, publicBundleFiles, readRevisionBundle, readRevisionBundleStrict, revisionBundleChecksum, sameRevisionBundleContents } = await import("./revision-bundle");

describe("revision bundle", () => {
  const bundle = { version: 1 as const, files: [{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400, assetKey: "private/source-a", previewKeys: ["preview-a"] }] };

  it("uses the manifest bytes, not an asset checksum, for a bundle revision", () => {
    expect(revisionBundleChecksum(bundle)).toHaveLength(64);
    expect(encodeRevisionBundle(bundle).toString()).toContain('"assetKey":"private/source-a"');
  });

  it("compares bundle content using file checksums while retaining meaningful metadata", () => {
    const original = { version: 2 as const, files: [{ ...bundle.files[0], kind: "asset", checksum: "a".repeat(64) }] };
    const duplicate = { version: 2 as const, files: [{ ...original.files[0], assetKey: "private/copied-asset" }] };
    expect(sameRevisionBundleContents(original, duplicate)).toBe(true);
    expect(sameRevisionBundleContents(original, { ...duplicate, files: [{ ...duplicate.files[0], name: "renamed.ai" }] })).toBe(false);
    expect(sameRevisionBundleContents(original, { ...duplicate, files: [{ ...duplicate.files[0], previewKeys: ["other-preview"] }] })).toBe(false);
    expect(sameRevisionBundleContents({ version: 2, files: [{ ...bundle.files[0] }] }, { version: 2, files: [{ ...bundle.files[0], assetKey: "private/copied-asset" }] })).toBe(false);
  });

  it("only exposes file metadata to form consumers", () => {
    expect(publicBundleFiles(bundle)).toEqual([{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400 }]);
  });

  it("counts files, not SVG internals, for structured capability", () => {
    expect(capabilityForBundle({ version: 2, files: [{ ...bundle.files[0], kind: "artboard" }], })).toEqual({ mode: "structured", unitCount: 1 });
    expect(capabilityForBundle(null)).toEqual({ mode: "whole_document", unitCount: 0 });
  });

  it("keeps v2 unit kinds, including unknown forward-compatible values", async () => {
    const v2 = { version: 2 as const, files: [{ ...bundle.files[0], kind: "future-unit" }] };
    mocks.getObject.mockResolvedValue({ ContentLength: 100, Body: { transformToString: async () => JSON.stringify(v2) } });
    expect(encodeRevisionBundle(v2).toString()).toContain('"version":2');
    expect((await readRevisionBundle("bundle-key"))?.files[0].kind).toBe("future-unit");
    expect(publicBundleFiles(v2)[0]).toMatchObject({ kind: "future-unit" });
  });

  it("validates v3 dependencies and exposes them publicly", async () => {
    const v3 = { version: 3 as const, files: [
      { ...bundle.files[0], id: "a", dependencies: ["b"] },
      { ...bundle.files[0], id: "b", dependencies: [] },
    ] };
    mocks.getObject.mockResolvedValue({ ContentLength: 100, Body: { transformToString: async () => JSON.stringify(v3) } });
    expect(encodeRevisionBundle(v3).toString()).toContain('"dependencies":["b"]');
    expect(await readRevisionBundle("bundle-key")).toEqual(v3);
    expect(publicBundleFiles(v3)[0]).toMatchObject({ id: "a", dependencies: ["b"] });
  });

  it.each([
    ["dangling", ["missing"]],
    ["self", ["a"]],
    ["duplicate", ["b", "b"]],
  ])("rejects %s v3 dependencies", (_case, dependencies) => {
    const v3 = { version: 3 as const, files: [
      { ...bundle.files[0], id: "a", dependencies },
      { ...bundle.files[0], id: "b", dependencies: [] },
    ] };
    expect(() => encodeRevisionBundle(v3)).toThrow("Invalid revision bundle");
  });

  it("allows cycles and terminates dependency closure traversal", () => {
    const v3 = { version: 3 as const, files: [
      { ...bundle.files[0], id: "a", dependencies: ["b"] },
      { ...bundle.files[0], id: "b", dependencies: ["a"] },
    ] };
    expect(() => encodeRevisionBundle(v3)).not.toThrow();
    expect([...dependencyClosure(v3, ["a"])].sort()).toEqual(["a", "b"]);
  });

  it("keeps storage failures retryable for strict readers without changing legacy callers", async () => {
    mocks.getObject.mockRejectedValue(new Error("storage unavailable"));
    await expect(readRevisionBundleStrict("bundle-key")).rejects.toThrow("storage unavailable");
    await expect(readRevisionBundle("bundle-key")).resolves.toBeNull();
  });

  it("normalizes display names without accepting an empty unit name", () => {
    expect(normalizeUnitName('  folder/"Card"\\name  ')).toBe("folder--Card--name");
    expect(normalizeUnitName(" \n ")).toBeNull();
  });
  it("derives proposal-compatible unit actions from stable manifest IDs", () => {
    const checksum = (value: string) => value.repeat(64).slice(0, 64);
    const base = { version: 2 as const, files: [
      { ...bundle.files[0], id: "modified", name: "Poster", kind: "artboard", checksum: checksum("a") },
      { ...bundle.files[0], id: "renamed", name: "Wordmark", kind: "component", checksum: checksum("b") },
      { ...bundle.files[0], id: "removed", name: "Spread", kind: "artboard", checksum: checksum("c") },
    ] };
    const source = { version: 2 as const, files: [
      { ...bundle.files[0], id: "modified", name: "Poster", kind: "artboard", checksum: checksum("d") },
      { ...bundle.files[0], id: "renamed", name: "Wordmark compact", kind: "component", checksum: checksum("b") },
      { ...bundle.files[0], id: "added", name: "New spread", kind: "artboard", checksum: checksum("e") },
    ] };

    expect(detectUnitChanges(base, source)).toEqual([
      expect.objectContaining({ action: "MODIFY_UNIT", targetFileId: "modified", sourceFileId: "modified" }),
      expect.objectContaining({ action: "RENAME_UNIT", targetFileId: "renamed", newName: "Wordmark compact" }),
      expect.objectContaining({ action: "REMOVE_UNIT", targetFileId: "removed" }),
      expect.objectContaining({ action: "ADD_UNIT", sourceFileId: "added" }),
    ]);
  });

  it("detects dependency set changes but ignores dependency order", () => {
    const unit = { ...bundle.files[0], id: "a", name: "A", kind: "component", checksum: "a".repeat(64) };
    expect(detectUnitChanges({ files: [{ ...unit, dependencies: ["b"] }] }, { files: [{ ...unit, dependencies: ["c"] }] })).toEqual([
      expect.objectContaining({ action: "MODIFY_UNIT", targetFileId: "a", sourceFileId: "a" }),
    ]);
    expect(detectUnitChanges({ files: [{ ...unit, dependencies: ["b", "c"] }] }, { files: [{ ...unit, dependencies: ["c", "b"] }] })).toEqual([]);
  });
});
