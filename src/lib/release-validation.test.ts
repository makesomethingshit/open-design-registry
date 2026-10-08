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
    ["invalid request ID", { ...valid, requestId: "not-a-uuid" }],
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

  it("accepts an optional UUID request ID and an explicit null", () => {
    const requestId = "3466d7a0-007d-4a11-b1ee-393d16ef1a34";
    expect(releaseCreateSchema.parse({ ...valid, requestId })).toMatchObject({ requestId });
    expect(releaseCreateSchema.parse({ ...valid, requestId: null })).toMatchObject({ requestId: null });
  });
});
