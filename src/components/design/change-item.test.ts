import { describe, expect, it } from "vitest";
import { changeActionPresentation, changeKindLabel, conflictStatusPresentation } from "./change-item";

describe("change presentation", () => {
  it("maps supported actions and legacy kinds without deriving labels from enum text", () => {
    expect(changeActionPresentation({ action: "ADD_UNIT", type: "ADD_UNIT" })).toMatchObject({ label: "Added", icon: "plus" });
    expect(changeActionPresentation({ action: "RENAME_UNIT", type: "RENAME_UNIT" })).toMatchObject({ label: "Renamed", icon: "rename" });
    expect(changeKindLabel("token")).toBe("Token");
    expect(changeKindLabel("future-unit")).toBe("Other unit");
    expect(changeKindLabel(null)).toBe("Asset - legacy");
  });

  it("uses the shared status tone for conflict presentation", () => {
    expect(conflictStatusPresentation("CONFLICT")).toMatchObject({ label: "Conflict", tone: "warning" });
    expect(conflictStatusPresentation("NO_CONFLICT")).toMatchObject({ label: "No conflict", tone: "neutral" });
  });
});
