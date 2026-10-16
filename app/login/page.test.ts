import { describe, expect, it } from "vitest";
import { safeNextPath } from "./login-helpers";

describe("login return path", () => {
  it("restores a local contribution path without allowing an external redirect", () => {
    expect(safeNextPath("/projects/poster/contribute")).toBe("/projects/poster/contribute");
    expect(safeNextPath("//example.com")).toBe("/");
    expect(safeNextPath("/\\example.com")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
