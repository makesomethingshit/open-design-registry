import { describe, expect, it } from "vitest";
import { previewAssetKey } from "./design-preview";

describe("preview asset state keys", () => {
  const asset = (id: string, url: string) => ({ id, position: 0, url, mimeType: "image/png", altText: id });

  it("keeps same-position assets and comparison sides independent", () => {
    expect(previewAssetKey("current", asset("a", "/a.png"))).not.toBe(previewAssetKey("current", asset("b", "/b.png")));
    expect(previewAssetKey("current", asset("a", "/a.png"))).not.toBe(previewAssetKey("previous", asset("a", "/a.png")));
  });
});
