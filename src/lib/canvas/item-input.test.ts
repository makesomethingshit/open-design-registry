import { describe, expect, it } from "vitest";
import { canvasItemInput, canvasItemImageMetadata, canvasImageMimeTypes, maxCanvasImageBytes, maxCanvasJsonRequestBytes, maxCanvasMultipartRequestBytes } from "./item-input";

describe("Canvas item input draft", () => {
  it("requires a nonempty text card and accepts provenance", () => {
    expect(canvasItemInput.safeParse({ kind: "TEXT", origin: "REFERENCE", body: "  Reference note ", sourceUrl: "https://example.org/" }).success).toBe(true);
    expect(canvasItemInput.safeParse({ kind: "TEXT", origin: "ORIGINAL", body: "   " }).success).toBe(false);
  });
  it("requires accessible alt text and rejects unowned asset keys supplied by clients", () => {
    expect(canvasItemImageMetadata.safeParse({ kind: "IMAGE", origin: "ORIGINAL", altText: "Exploration 1" }).success).toBe(true);
    expect(canvasItemInput.safeParse({ kind: "IMAGE", origin: "ORIGINAL", altText: "A", assetKey: "covers/other-user/private" }).success).toBe(false);
  });
  it("rejects dangerous URL schemes and limits uploads for downstream server validation", () => {
    expect(canvasItemInput.safeParse({ kind: "TEXT", origin: "REFERENCE", body: "Ref", sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(canvasImageMimeTypes.has("text/html")).toBe(false);
    expect(maxCanvasImageBytes).toBe(10485760);
  });
  it("caps source URLs at 2048 characters", () => {
    const prefix = "https://example.org/";
    const valid = { kind: "TEXT", origin: "REFERENCE", body: "Ref", sourceUrl: prefix + "a".repeat(2048 - prefix.length) };
    const oversized = { ...valid, sourceUrl: `${valid.sourceUrl}a` };
    expect(canvasItemInput.safeParse(valid).success).toBe(true);
    expect(canvasItemInput.safeParse(oversized).success).toBe(false);
  });
  it("exports the bounded request limits for JSON and multipart item submissions", () => {
    expect(maxCanvasJsonRequestBytes).toBe(64 * 1024);
    expect(maxCanvasMultipartRequestBytes).toBe(maxCanvasImageBytes + 64 * 1024);
  });
});
