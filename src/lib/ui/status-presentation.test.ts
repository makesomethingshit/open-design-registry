import { describe, expect, it } from "vitest";
import { changeReviewStatusPresentation, proposalStatusPresentation } from "./status-presentation";
import { setRowBusy, setRowMessage } from "./task-state";

describe("status presentation", () => {
  it("maps the display-only proposal and change states", () => {
    expect(proposalStatusPresentation("PARTIALLY_ACCEPTED", 1, 3)).toMatchObject({ label: "Partially applied · 1/3", tone: "accent" });
    expect(changeReviewStatusPresentation("PENDING")).toMatchObject({ label: "Pending review", tone: "neutral" });
    expect(changeReviewStatusPresentation("APPROVED", 12)).toMatchObject({ label: "Applied · r12", tone: "accent" });
  });

  it("keeps an unknown server value readable", () => {
    expect(proposalStatusPresentation("FUTURE_STATUS")).toMatchObject({ label: "Unknown status", tone: "neutral" });
  });

  it("keeps task pending and error state scoped to each row", () => {
    const pending = setRowBusy(setRowBusy({}, "a", true), "b", true);
    const errors = setRowMessage(setRowMessage({}, "a", "A failed"), "b", "B failed");

    expect(setRowBusy(pending, "a", false)).toEqual({ a: false, b: true });
    expect(setRowMessage(errors, "b", "")).toEqual({ a: "A failed", b: "" });
  });
});
