import { describe, expect, it } from "vitest";
import { canvasItemInput, canvasItemImageMetadata, canvasImageMimeTypes, maxCanvasImageBytes } from "./item-input";

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
});
