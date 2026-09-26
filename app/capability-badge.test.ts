import { describe, expect, it } from "vitest";
import { capabilityText } from "./capability-badge";

describe("capability presentation", () => {
  it("describes selectable file units without implying merge support", () => {
    expect(capabilityText("STRUCTURED", 3)).toBe("3 selectable file units");
    expect(capabilityText("STRUCTURED")).toBe("Selectable file units · count not recorded");
  });

  it("keeps whole-document and missing legacy capability states distinct", () => {
    expect(capabilityText("WHOLE_DOCUMENT", 0)).toBe("Whole-document proposals");
    expect(capabilityText(null, null)).toBe("Capability not recorded");
  });
});
