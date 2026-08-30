import { describe, expect, it } from "vitest";
import { imageTypes, maxImageBytes, projectSchema, slugify } from "./project-validation";

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
});
