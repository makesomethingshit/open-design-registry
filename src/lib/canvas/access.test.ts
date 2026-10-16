import { describe, expect, it } from "vitest";
import { mayCommentOnCanvas, mayEditCanvas, mayManageCanvasApplications, mayReadCanvas, type CanvasAccessFacts } from "./access";

const base: CanvasAccessFacts = {
  projectPublic: true, projectOwnerId: "project-owner",
  canvasOwnerId: "designer", status: "APPROVED", previouslyApproved: true,
};

describe("Canvas access policy draft", () => {
  it("never grants another designer or project owner edit rights", () => {
    expect(mayEditCanvas("designer", base)).toBe(true);
    expect(mayEditCanvas("project-owner", base)).toBe(false);
    expect(mayEditCanvas("other-designer", base)).toBe(false);
    expect(mayManageCanvasApplications("project-owner", base)).toBe(true);
    expect(mayManageCanvasApplications("designer", base)).toBe(false);
  });
  it("exposes past approved work read-only during revoked/reapplication states", () => {
    for (const status of ["REVOKED", "PENDING", "REJECTED"] as const) {
      const old = { ...base, status };
      expect(mayReadCanvas(null, old)).toBe(true);
      expect(mayEditCanvas("designer", old)).toBe(false);
      expect(mayCommentOnCanvas("visitor", old)).toBe(false);
    }
  });
  it("never exposes first-time applicants or a private project", () => {
    expect(mayReadCanvas(null, { ...base, canvasOwnerId: null, status: "PENDING", previouslyApproved: false })).toBe(false);
    expect(mayReadCanvas(null, { ...base, status: "PENDING", previouslyApproved: false })).toBe(false);
    expect(mayReadCanvas("designer", { ...base, status: "PENDING", previouslyApproved: false })).toBe(true);
    for (const viewer of [null, "designer", "project-owner"]) {
      expect(mayReadCanvas(viewer, { ...base, projectPublic: false })).toBe(false);
      expect(mayEditCanvas(viewer, { ...base, projectPublic: false })).toBe(false);
    }
  });
});
