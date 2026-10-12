import { describe, expect, it } from "vitest";
import { composeContributionBrief } from "./contribution-brief";

describe("optional contribution brief", () => {
  it("stores only completed prompts as readable sections in Issue.body", () => {
    expect(composeContributionBrief({
      purpose: "  Improve keyboard navigation  ",
      scope: "  Keep the existing shortcut bindings  ",
      references: "",
      deliverables: "  A revised interaction design  ",
      criteria: "  Usable without a mouse  ",
    })).toBe(
      "Purpose:\nImprove keyboard navigation\n\n" +
      "Scope and constraints:\nKeep the existing shortcut bindings\n\n" +
      "Expected deliverables:\nA revised interaction design\n\n" +
      "Review criteria:\nUsable without a mouse",
    );
  });

  it("keeps empty sections out and preserves unconstrained notes", () => {
    expect(composeContributionBrief({ notes: " Existing freeform context. " })).toBe("Additional details:\nExisting freeform context.");
    expect(composeContributionBrief({ purpose: "  ", references: "\n", criteria: "" })).toBe("");
  });

  it("keeps newlines in user-authored fields", () => {
    expect(composeContributionBrief({ references: "Revision 2\nBrand guide" })).toBe("References:\nRevision 2\nBrand guide");
  });
});
