import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ getObject: vi.fn(), putBytes: vi.fn() }));

const { encodeRevisionBundle, publicBundleFiles, revisionBundleChecksum } = await import("./revision-bundle");

describe("revision bundle", () => {
  const bundle = { version: 1 as const, files: [{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400, assetKey: "private/source-a", previewKeys: ["preview-a"] }] };

  it("uses the manifest bytes, not an asset checksum, for a bundle revision", () => {
    expect(revisionBundleChecksum(bundle)).toHaveLength(64);
    expect(encodeRevisionBundle(bundle).toString()).toContain('"assetKey":"private/source-a"');
  });

  it("only exposes file metadata to form consumers", () => {
    expect(publicBundleFiles(bundle)).toEqual([{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 2400 }]);
  });
});
