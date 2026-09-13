import { describe, expect, it } from "vitest";
import { parseRightsDeclaration, permissionLabel, unknownRightsCount } from "./rights";

describe("rights declarations", () => {
  it("stores an explicit same-as-revision source mode without inferring permissions", () => {
    const result = parseRightsDeclaration({ sourceRightsMode: "SAME_AS_REVISION", items: [] });
    expect(result.data).toMatchObject({ sourceRightsMode: "SAME_AS_REVISION", items: [] });
  });

  it("keeps unknown and restricted permissions explicit", () => {
    const result = parseRightsDeclaration({
      sourceRightsMode: "UNKNOWN",
      items: [{ type: "IMAGE", name: "Hero", redistribution: "UNKNOWN", derivativeUse: "RESTRICTED" }],
    });
    expect(result.data?.items[0].redistribution).toBe("UNKNOWN");
    expect(result.data?.items[0].derivativeUse).toBe("RESTRICTED");
    expect(unknownRightsCount(result.data!)).toBe(1);
    expect(permissionLabel("NOT_ALLOWED")).toBe("Declared not allowed");
  });

  it("requires a license name for separate source rights", () => {
    expect(parseRightsDeclaration({ sourceRightsMode: "SEPARATE" })).toHaveProperty("error");
  });

  it.each(["javascript:alert(1)", "file:///private/source", "data:text/plain,source"]) ("rejects non-HTTP(S) rights URL %s", (url) => {
    expect(parseRightsDeclaration({ sourceLicenseUrl: url })).toHaveProperty("error");
    expect(parseRightsDeclaration({ items: [{ type: "OTHER", name: "Asset", licenseUrl: url, sourceUrl: url }] })).toHaveProperty("error");
  });

  it("accepts HTTP(S) URLs for source and dependency evidence", () => {
    const result = parseRightsDeclaration({ sourceLicenseUrl: "https://example.com/license", items: [{ type: "OTHER", name: "Asset", licenseUrl: "http://example.com/license", sourceUrl: "https://example.com/source" }] });
    expect(result.data).toMatchObject({ sourceLicenseUrl: "https://example.com/license", items: [{ licenseUrl: "http://example.com/license", sourceUrl: "https://example.com/source" }] });
  });
});
