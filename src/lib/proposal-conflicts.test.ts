import { describe, expect, it } from "vitest";
import { changedUnitIds, conflictForChange, renamedUnitIds } from "./proposal-conflicts";

const checksum = (value: string) => value.repeat(64).slice(0, 64);
const file = (id: string, value?: string, name = "Home") => ({ id, name, kind: "artboard", mimeType: "image/png", size: 10, assetKey: `${id}-key`, previewKeys: [], ...(value === undefined ? {} : { checksum: checksum(value) }) });
const change = { type: "MODIFY_UNIT", action: "MODIFY_UNIT", targetFileId: "home" };

describe("proposal unit conflict checks", () => {
  it("uses per-unit checksums before metadata", () => {
    expect(conflictForChange(change, { version: 2, files: [file("home", "a", "Home")] }, { version: 2, files: [file("home", "a", "Landing")] })).toMatchObject({ status: "NO_CONFLICT" });
    expect(conflictForChange(change, { version: 2, files: [file("home", "a")] }, { version: 2, files: [file("home", "b")] })).toMatchObject({ status: "CONFLICT", reason: "Source content changed upstream." });
  });

  it("conflicts on upstream renames while preserving checksum priority for modifications", () => {
    const base = { version: 2 as const, files: [file("home", "a", "Home")] };
    const latest = { version: 2 as const, files: [file("home", "a", "Landing")] };
    expect(conflictForChange({ type: "RENAME_UNIT", action: "RENAME_UNIT", targetFileId: "home" }, base, latest)).toEqual({ status: "CONFLICT", reason: "Unit name changed upstream." });
    expect(conflictForChange(change, base, latest)).toMatchObject({ status: "NO_CONFLICT" });
    expect(renamedUnitIds(base, latest, null)).toEqual(["home"]);
  });

  it("treats dependency mutations as conflicts and upstream unit changes", () => {
    const before = { version: 3 as const, files: [{ ...file("home", "a"), dependencies: ["token"] }, { ...file("token", "b"), dependencies: [] }] };
    const after = { version: 3 as const, files: [{ ...file("home", "a"), dependencies: [] }, { ...file("token", "b"), dependencies: [] }] };
    expect(conflictForChange(change, before, after)).toEqual({ status: "CONFLICT", reason: "Unit dependencies changed upstream." });
    expect(changedUnitIds(before, after, null)).toEqual(["home"]);
  });

  it("does not infer no-conflict for legacy units without checksums", () => {
    expect(conflictForChange(change, { version: 1, files: [file("home")] }, { version: 1, files: [file("home")] })).toMatchObject({ status: "CHECK_UNAVAILABLE" });
    expect(conflictForChange(change, { version: 1, files: [file("home")] }, { version: 1, files: [file("home", undefined, "Landing")] })).toMatchObject({ status: "CONFLICT", reason: "Unit metadata changed upstream." });
  });

  it("blocks removed targets and accepts only unused reserved add IDs", () => {
    expect(conflictForChange(change, { version: 2, files: [file("home", "a")] }, { version: 2, files: [] })).toMatchObject({ status: "CONFLICT", reason: expect.stringMatching(/removed/i) });
    expect(conflictForChange(change, { version: 2, files: [] }, { version: 2, files: [file("home", "a")] })).toMatchObject({ status: "CHECK_UNAVAILABLE" });
    expect(conflictForChange({ type: "ADD_UNIT", action: "ADD_UNIT", targetFileId: "new" }, { version: 2, files: [] }, { version: 2, files: [] })).toMatchObject({ status: "NO_CONFLICT" });
    expect(conflictForChange({ type: "ADD_UNIT", action: "ADD_UNIT", targetFileId: "new" }, { version: 2, files: [] }, { version: 2, files: [file("new", "a")] })).toMatchObject({ status: "CONFLICT" });
  });

  it("finds every changed unit when a whole document is applied", () => {
    const before = { version: 2 as const, files: [file("changed", "a"), file("removed", "b"), file("same", "c")] };
    const after = { version: 2 as const, files: [file("changed", "d"), file("same", "c"), file("unrelated", "e")] };
    expect(changedUnitIds(before, after, null).sort()).toEqual(["changed", "removed", "unrelated"]);
    expect(changedUnitIds(before, after, ["same"])).toEqual([]);
  });
});
