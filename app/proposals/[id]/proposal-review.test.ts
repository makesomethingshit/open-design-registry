import { describe, expect, it } from "vitest";
import { removalWarning, selectedUnitResultCount } from "./proposal-review";

describe("proposal apply unit guard", () => {
  const changes = [
    { id: "remove", action: "REMOVE_UNIT", type: "REMOVE_UNIT" },
    { id: "add", action: "ADD_UNIT", type: "ADD_UNIT" },
    { id: "rename", action: "RENAME_UNIT", type: "RENAME_UNIT" },
  ];

  it("blocks only a final empty result and permits an approved add plus remove", () => {
    expect(selectedUnitResultCount(1, changes, ["remove"])).toBe(0);
    expect(selectedUnitResultCount(1, changes, ["add", "remove"])).toBe(1);
    expect(selectedUnitResultCount(1, changes, ["rename"])).toBe(1);
  });

  it("uses singular and plural removal copy", () => {
    expect(removalWarning(1)).toMatch(/^1 unit will/);
    expect(removalWarning(2)).toMatch(/^2 units will/);
  });
});
