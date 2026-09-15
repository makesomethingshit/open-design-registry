import { describe, expect, it } from "vitest";
import { validateRightsAgainstRevision } from "./revision-rights";

describe("revision rights context", () => {
  it("rejects same-as-revision without a recorded license", () => {
    expect(validateRightsAgainstRevision({ license: null }, { sourceRightsMode: "SAME_AS_REVISION", items: [] })).toContain("no recorded license");
    expect(validateRightsAgainstRevision({ license: "MIT" }, { sourceRightsMode: "SAME_AS_REVISION", items: [] })).toBeNull();
  });
});
