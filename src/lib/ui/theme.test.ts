import { describe, expect, it } from "vitest";
import { isThemeValue, themeFromCookie } from "./theme";

describe("theme cookie values", () => {
  it("accepts only the three public theme choices", () => {
    expect(isThemeValue("light")).toBe(true);
    expect(isThemeValue("dark")).toBe(true);
    expect(isThemeValue("system")).toBe(true);
    expect(isThemeValue("violet")).toBe(false);
  });

  it("defaults an absent or invalid cookie to light", () => {
    expect(themeFromCookie(undefined)).toBe("light");
    expect(themeFromCookie("violet")).toBe("light");
  });
});
