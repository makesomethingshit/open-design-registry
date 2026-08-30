import { describe, expect, it } from "vitest";
import { imageTypes, maxImageBytes, projectSchema, projectUpdateSchema, revisionUrlSchema, slugify } from "./project-validation";

describe("project validation", () => {
  it("accepts a valid project and creates a stable slug", () => {
    expect(projectSchema.parse({ title: "My New Design", license: "MIT" }).isPublic).toBe(true);
    expect(slugify("My New Design!")).toBe("my-new-design");
  });
  it("keeps image rules intentionally narrow", () => {
    expect(imageTypes.has("image/png")).toBe(true);
    expect(imageTypes.has("image/svg+xml")).toBe(false);
    expect(maxImageBytes).toBe(10 * 1024 * 1024);
  });
  it("does not add defaults during a partial project update", () => {
    const existing = { title: "old", description: "keep this", license: "MIT", isPublic: false };
    const update = projectUpdateSchema.parse({ title: "renamed" });
    expect({ ...existing, ...update }).toEqual({ title: "renamed", description: "keep this", license: "MIT", isPublic: false });
  });
  it("only accepts HTTP(S) revision sources", () => {
    expect(revisionUrlSchema.safeParse("https://example.com/design.zip").success).toBe(true);
    expect(revisionUrlSchema.safeParse("ftp://example.com/design.zip").success).toBe(false);
  });
});
