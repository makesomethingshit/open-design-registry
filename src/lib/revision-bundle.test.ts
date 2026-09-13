import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getObject: vi.fn(), putBytes: vi.fn() }));
vi.mock("./storage", () => ({ getObject: mocks.getObject, putBytes: mocks.putBytes }));

const { capabilityForBundle, detectUnitChanges, encodeRevisionBundle, normalizeUnitName, publicBundleFiles, readRevisionBundle, readRevisionBundleStrict, revisionBundleChecksum } = await import("./revision-bundle");

describe("revision bundle", () => {
  const bundle = { version: 1 as const, files: [{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400, assetKey: "private/source-a", previewKeys: ["preview-a"] }] };

  it("uses the manifest bytes, not an asset checksum, for a bundle revision", () => {
    expect(revisionBundleChecksum(bundle)).toHaveLength(64);
    expect(encodeRevisionBundle(bundle).toString()).toContain('"assetKey":"private/source-a"');
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
});
