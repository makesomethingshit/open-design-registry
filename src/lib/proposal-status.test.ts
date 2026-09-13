import { describe, expect, it } from "vitest";
import { proposalCanBeReviewed, proposalStatusForChanges } from "./proposal-status";

describe("proposal status", () => {
  it("derives the reachable review states from changes", () => {
    expect(proposalStatusForChanges(["PENDING"])).toBe("OPEN");
    expect(proposalStatusForChanges(["CHANGES_REQUESTED"])).toBe("CHANGES_REQUESTED");
    expect(proposalStatusForChanges(["APPROVED"])).toBe("APPROVED");
    expect(proposalStatusForChanges(["APPROVED", "PENDING"])).toBe("OPEN");
  });

  it("only marks a proposal partially accepted after a file is actually applied", () => {
    expect(proposalStatusForChanges(["APPROVED", "PENDING"], 1)).toBe("PARTIALLY_ACCEPTED");
    expect(proposalStatusForChanges(["APPROVED", "APPROVED"], 1)).toBe("PARTIALLY_ACCEPTED");
    expect(proposalStatusForChanges(["APPROVED", "PENDING"], 2)).toBe("ACCEPTED");
  });

  it("does not reopen an accepted or closed proposal for review", () => {
    expect(proposalCanBeReviewed("ACCEPTED")).toBe(false);
    expect(proposalCanBeReviewed("CLOSED")).toBe(false);
    expect(proposalCanBeReviewed("PARTIALLY_ACCEPTED")).toBe(true);
  });
});
