import { describe, expect, it } from "vitest";
import { releaseCreateSchema } from "./release-validation";

const valid = { title: "Navigation rethink", revisionIds: ["revision-1"] };

describe("releaseCreateSchema", () => {
  it.each([
    ["empty title", { ...valid, title: "   " }],
    ["title over 120 characters", { ...valid, title: "x".repeat(121) }],
    ["description over 2000 characters", { ...valid, description: "x".repeat(2001) }],
    ["no revisions", { ...valid, revisionIds: [] }],
    ["more than 50 revisions", { ...valid, revisionIds: Array.from({ length: 51 }, (_, index) => `revision-${index}`) }],
    ["duplicate revisions", { ...valid, revisionIds: ["revision-1", " revision-1 "] }],
    ["unknown fields", { ...valid, releaseNumber: 8 }],
  ])("rejects %s", (_label, input) => {
    expect(releaseCreateSchema.safeParse(input).success).toBe(false);
  });

  it("trims text and defaults an omitted description", () => {
    expect(releaseCreateSchema.parse({ title: "  Navigation rethink  ", revisionIds: [" revision-1 "] })).toEqual({
      title: "Navigation rethink",
      description: "",
      revisionIds: ["revision-1"],
    });
  });
});
