import { describe, expect, it } from "vitest";
import { changeReviewStatusPresentation, proposalStatusPresentation } from "./status-presentation";

describe("status presentation", () => {
  it("maps the display-only proposal and change states", () => {
    expect(proposalStatusPresentation("PARTIALLY_ACCEPTED", 1, 3)).toMatchObject({ label: "Partially applied · 1/3", tone: "accent" });
    expect(changeReviewStatusPresentation("PENDING")).toMatchObject({ label: "Pending review", tone: "neutral" });
    expect(changeReviewStatusPresentation("APPROVED", 12)).toMatchObject({ label: "Applied · r12", tone: "accent" });
  });

  it("keeps an unknown server value readable", () => {
    expect(proposalStatusPresentation("FUTURE_STATUS")).toMatchObject({ label: "Unknown status", tone: "neutral" });
  });
});
