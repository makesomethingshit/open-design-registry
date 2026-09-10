import { describe, expect, it } from "vitest";
import type { ReviewChange } from "@/src/components/design/review-types";
import { applicationSelectionLabel, applicationStatusPresentation } from "@/src/components/design/change-item";
import { selectionAfterServerChanges } from "./proposal-review";
import { changeReviewStatusPresentation } from "@/src/lib/ui/status-presentation";

describe("E2 review / application separation", () => {
  const change = (id: string, reviewStatus: ReviewChange["reviewStatus"], appliedRevision: ReviewChange["appliedRevision"] = null) => ({ id, reviewStatus, appliedRevision });

  it("keeps review status presentation independent from application state", () => {
    expect(changeReviewStatusPresentation("PENDING")).toMatchObject({ label: "Pending review" });
    expect(changeReviewStatusPresentation("APPROVED")).toMatchObject({ label: "Approved" });
    expect(changeReviewStatusPresentation("CHANGES_REQUESTED")).toMatchObject({ label: "Changes requested" });
  });

  it("labels application state only for applied changes", () => {
    expect(applicationStatusPresentation(change("a", "APPROVED"))).toBeNull();
    expect(applicationStatusPresentation(change("a", "APPROVED", { id: "r13", number: 13, title: "Applied" }))).toMatchObject({ label: "Applied · r13" });
  });

  it("marks checkboxes as application-only in the accessible name", () => {
    expect(applicationSelectionLabel("Poster / Main")).toBe("Select Poster / Main for application");
  });

  it("drops a selection only when the server marks the change ineligible", () => {
    const changes = [
      change("kept", "APPROVED"),
      change("now-applied", "APPROVED", { id: "r13", number: 13, title: "Applied" }),
      change("now-pending", "PENDING"),
    ];
    const eligibility = (candidate: Pick<ReviewChange, "id" | "reviewStatus" | "appliedRevision">) => candidate.reviewStatus === "APPROVED" && !candidate.appliedRevision;
    const result = selectionAfterServerChanges(["kept", "now-applied", "now-pending", "gone"], changes, eligibility);
    expect(result.selected).toEqual(["kept"]);
    expect(result.dropped).toEqual(["now-applied", "now-pending", "gone"]);
  });

  it("keeps a review API failure from clearing the selection", () => {
    // A failed review request returns no server change list; the selection must stay intact.
    const changes = [change("a", "APPROVED"), change("b", "PENDING")];
    const eligibility = (candidate: Pick<ReviewChange, "id" | "reviewStatus" | "appliedRevision">) => candidate.reviewStatus === "APPROVED" && !candidate.appliedRevision;
    expect(selectionAfterServerChanges(["a"], changes, eligibility).selected).toEqual(["a"]);
  });
});
