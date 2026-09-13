import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SourceRights from "./source-rights";

const declaration = {
  id: "declaration-1",
  version: 2,
  createdAt: "2026-09-13T00:00:00.000Z",
  sourceRightsMode: "SEPARATE" as const,
  sourceLicenseName: "Studio license",
  sourceLicenseUrl: "https://example.com/source-license",
  sourceRightsHolder: "Studio",
  notes: "Verify the source package before reuse.",
  items: [{
    type: "IMAGE" as const,
    name: "Hero image",
    rightsHolder: "Image Studio",
    licenseName: "Custom",
    licenseUrl: "https://example.com/hero-license",
    sourceUrl: "https://example.com/hero",
    redistribution: "RESTRICTED" as const,
    derivativeUse: "UNKNOWN" as const,
    notes: "Do not redistribute the original.",
  }, {
    type: "FONT" as const,
    name: "Font A",
    redistribution: "UNKNOWN" as const,
    derivativeUse: "UNKNOWN" as const,
    notes: "Font A requires a separate license review.",
  }],
};

function render(isOwner: boolean) {
  return renderToStaticMarkup(createElement(SourceRights, {
    slug: "demo",
    number: 2,
    revisionLicense: "MIT",
    sourceHref: null,
    sourceFiles: [],
    tool: "penpot",
    toolVersion: "2",
    sourceChecksum: null,
    declaration,
    isOwner,
  }));
}

describe("revision source rights detail", () => {
  it("renders public rights evidence and restricted state", () => {
    const markup = render(false);

    expect(markup).toContain("Image Studio");
    expect(markup).toContain("https://example.com/hero-license");
    expect(markup).toContain("View license for Hero image");
    expect(markup).toContain("Do not redistribute the original.");
    expect(markup).toContain("Verify the source package before reuse.");
    expect(markup).toContain("rights-item-restricted");
    expect(markup).toContain("View source reference");
    const fontStart = markup.indexOf("Font A");
    const fontEnd = markup.indexOf("</li>", fontStart);
    expect(markup.slice(fontStart, fontEnd)).toContain("Notes: Font A requires a separate license review.");
    expect(markup).not.toContain('aria-label="Rights evidence"');
  });

  it("keeps the owner editing affordance on the same detail", () => {
    expect(render(true)).toContain("Add rights information");
  });
});
