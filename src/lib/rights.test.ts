import { describe, expect, it } from "vitest";
import { parseRightsDeclaration, permissionLabel, sourceLicenseFieldsForMode, unknownRightsCount } from "./rights";

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

  it("requires source license metadata to stay in separate mode", () => {
    expect(parseRightsDeclaration({ sourceRightsMode: "SEPARATE", sourceLicenseName: "Studio License" })).toHaveProperty("data");
    expect(parseRightsDeclaration({ sourceRightsMode: "SEPARATE", sourceLicenseName: "Studio License", sourceLicenseUrl: "https://example.com/license" })).toHaveProperty("data");
    expect(parseRightsDeclaration({ sourceRightsMode: "UNKNOWN", sourceLicenseName: "Studio License" })).toHaveProperty("error");
    expect(parseRightsDeclaration({ sourceRightsMode: "UNKNOWN", sourceLicenseUrl: "https://example.com/license" })).toHaveProperty("error");
    expect(parseRightsDeclaration({ sourceRightsMode: "SAME_AS_REVISION", sourceLicenseName: "Studio License" })).toHaveProperty("error");
    expect(parseRightsDeclaration({ sourceRightsMode: "SAME_AS_REVISION", sourceLicenseUrl: "https://example.com/license" })).toHaveProperty("error");
  });

  it.each(["UNKNOWN", "SAME_AS_REVISION"] as const)("keeps a rights holder independent in %s mode", (sourceRightsMode) => {
    expect(parseRightsDeclaration({ sourceRightsMode, sourceRightsHolder: "Studio" })).toMatchObject({ data: { sourceRightsMode, sourceRightsHolder: "Studio" } });
  });

  it.each(["UNKNOWN", "SAME_AS_REVISION"] as const)("clears source license fields when switching to %s", (sourceRightsMode) => {
    expect(sourceLicenseFieldsForMode(sourceRightsMode, "Studio License", "https://example.com/license")).toEqual({ sourceLicenseName: "", sourceLicenseUrl: "" });
  });

  it.each(["javascript:alert(1)", "file:///private/source", "data:text/plain,source"]) ("rejects non-HTTP(S) rights URL %s", (url) => {
    expect(parseRightsDeclaration({ sourceLicenseUrl: url })).toHaveProperty("error");
    expect(parseRightsDeclaration({ items: [{ type: "OTHER", name: "Asset", licenseUrl: url, sourceUrl: url }] })).toHaveProperty("error");
  });

  it("accepts HTTP(S) URLs for source and dependency evidence", () => {
    const result = parseRightsDeclaration({ sourceRightsMode: "SEPARATE", sourceLicenseName: "Studio License", sourceLicenseUrl: "https://example.com/license", items: [{ type: "OTHER", name: "Asset", licenseUrl: "http://example.com/license", sourceUrl: "https://example.com/source" }] });
    expect(result.data).toMatchObject({ sourceLicenseUrl: "https://example.com/license", items: [{ licenseUrl: "http://example.com/license", sourceUrl: "https://example.com/source" }] });
  });
});
