import { describe, expect, it } from "vitest";
import { proposalCanBeReviewed, proposalStatusForChanges } from "./proposal-status";

describe("proposal status", () => {
  it("derives the reachable review states from changes", () => {
    expect(proposalStatusForChanges(["PENDING"])).toBe("OPEN");
    expect(proposalStatusForChanges(["CHANGES_REQUESTED"])).toBe("CHANGES_REQUESTED");
    expect(proposalStatusForChanges(["APPROVED"])).toBe("APPROVED");
  });

  it("does not reopen an accepted or closed proposal for review", () => {
    expect(proposalCanBeReviewed("ACCEPTED")).toBe(false);
    expect(proposalCanBeReviewed("CLOSED")).toBe(false);
  });
});
