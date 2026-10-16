import { describe, expect, it } from "vitest";
import { parseInitialChanges } from "./proposal-helpers";

describe("prepared proposal handoff", () => {
  it("keeps supported selected changes and drops malformed URL state", () => {
    expect(parseInitialChanges(JSON.stringify([
      { action: "MODIFY_UNIT", targetFileId: "target", sourceFileId: "source" },
      { action: "RENAME_UNIT", targetFileId: "wordmark", newName: "Compact" },
      { action: "ADD_UNIT", sourceFileId: "new-unit" },
      { action: "REMOVE_UNIT", targetFileId: "old-unit" },
      { action: "UNSUPPORTED", targetFileId: "ignored" },
    ]))).toEqual([
      { action: "MODIFY_UNIT", targetFileId: "target", sourceFileId: "source" },
      { action: "RENAME_UNIT", targetFileId: "wordmark", newName: "Compact" },
      { action: "ADD_UNIT", sourceFileId: "new-unit" },
      { action: "REMOVE_UNIT", targetFileId: "old-unit" },
    ]);
    expect(parseInitialChanges("not-json")).toEqual([]);
  });

  it.each([0, 1, 10, 11])("preserves the %i-change handoff boundary for the form", (count) => {
    const changes = Array.from({ length: count }, (_, index) => ({ action: "ADD_UNIT", sourceFileId: `unit-${index}` }));
    expect(parseInitialChanges(JSON.stringify(changes))).toHaveLength(count);
  });
});
