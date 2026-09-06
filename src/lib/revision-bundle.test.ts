import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getObject: vi.fn(), putBytes: vi.fn() }));
vi.mock("./storage", () => ({ getObject: mocks.getObject, putBytes: mocks.putBytes }));

const { encodeRevisionBundle, normalizeUnitName, publicBundleFiles, readRevisionBundle, revisionBundleChecksum } = await import("./revision-bundle");

describe("revision bundle", () => {
  const bundle = { version: 1 as const, files: [{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400, assetKey: "private/source-a", previewKeys: ["preview-a"] }] };

  it("uses the manifest bytes, not an asset checksum, for a bundle revision", () => {
    expect(revisionBundleChecksum(bundle)).toHaveLength(64);
    expect(encodeRevisionBundle(bundle).toString()).toContain('"assetKey":"private/source-a"');
  });

  it("only exposes file metadata to form consumers", () => {
    expect(publicBundleFiles(bundle)).toEqual([{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400 }]);
  });

  it("keeps v2 unit kinds, including unknown forward-compatible values", async () => {
    const v2 = { version: 2 as const, files: [{ ...bundle.files[0], kind: "future-unit" }] };
    mocks.getObject.mockResolvedValue({ ContentLength: 100, Body: { transformToString: async () => JSON.stringify(v2) } });
    expect(encodeRevisionBundle(v2).toString()).toContain('"version":2');
    expect((await readRevisionBundle("bundle-key"))?.files[0].kind).toBe("future-unit");
    expect(publicBundleFiles(v2)[0]).toMatchObject({ kind: "future-unit" });
  });

  it("normalizes display names without accepting an empty unit name", () => {
    expect(normalizeUnitName('  folder/"Card"\\name  ')).toBe("folder--Card--name");
    expect(normalizeUnitName(" \n ")).toBeNull();
  });
});
