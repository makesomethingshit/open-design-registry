import { describe, expect, it } from "vitest";
import { adapterRegistry, suggestFile } from "./adapters";

describe("SVG adapter", () => {
  it("suggests one file-level artboard with adapter-owned confidence", async () => {
    const result = await suggestFile(new File(["<?xml version=\"1.0\"?><svg viewBox=\"0 0 10 10\"><g><path /></g></svg>"], "hero.svg", { type: "image/svg+xml" }));
    expect(result).toEqual({ status: "available", suggestion: { kind: "artboard", confidence: "low", adapterId: "svg", adapterVersion: "0.4", maturity: "beta" } });
  });

  it("does not trust an extension without an SVG root", () => {
    expect(adapterRegistry.suggest({ name: "not-a-design.svg", mimeType: "image/svg+xml", content: "not svg" })).toEqual({ status: "unsupported" });
  });
});
