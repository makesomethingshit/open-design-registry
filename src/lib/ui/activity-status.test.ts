import { describe, expect, it } from "vitest";
import { isProjectActivityStatus, projectActivityStatusPresentation } from "./activity-status";

describe("project activity status presentation", () => {
  it("labels each descriptive state without implying completion", () => {
    expect(projectActivityStatusPresentation("ACTIVE")).toMatchObject({ label: "Active", tone: "success" });
    expect(projectActivityStatusPresentation("PAUSED")).toMatchObject({ label: "Paused", tone: "warning" });
    expect(projectActivityStatusPresentation("ARCHIVED")).toMatchObject({ label: "Archived", tone: "neutral" });
  });

  it("falls back to unknown for unexpected values", () => {
    expect(projectActivityStatusPresentation("COMPLETED")).toMatchObject({ label: "Unknown status" });
    expect(projectActivityStatusPresentation("")).toMatchObject({ label: "Unknown status" });
  });

  it("only accepts the three descriptive states", () => {
    expect(isProjectActivityStatus("ACTIVE")).toBe(true);
    expect(isProjectActivityStatus("PAUSED")).toBe(true);
    expect(isProjectActivityStatus("ARCHIVED")).toBe(true);
    expect(isProjectActivityStatus("Completed")).toBe(false);
    expect(isProjectActivityStatus("Final")).toBe(false);
    expect(isProjectActivityStatus("Stable")).toBe(false);
  });
});
