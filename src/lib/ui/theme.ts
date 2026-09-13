export const themeCookieName = "odr-theme";
export const themeValues = ["light", "dark", "system"] as const;

export type ThemeValue = typeof themeValues[number];

export function isThemeValue(value: string | undefined): value is ThemeValue {
  return value === "light" || value === "dark" || value === "system";
}

export function themeFromCookie(value: string | undefined): ThemeValue {
  return isThemeValue(value) ? value : "light";
}
