"use client";

import { useState } from "react";
import { uiCopy } from "@/src/lib/ui/copy";
import { isThemeValue, themeCookieName, type ThemeValue } from "@/src/lib/ui/theme";
import styles from "./theme-select.module.css";

export function ThemeSelect({ initialTheme }: { initialTheme: ThemeValue }) {
  const [theme, setTheme] = useState(initialTheme);

  function changeTheme(value: string) {
    if (!isThemeValue(value)) return;
    document.documentElement.dataset.theme = value;
    document.cookie = `${themeCookieName}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setTheme(value);
  }

  return <label className={styles.themeSelect}>
    <span>{uiCopy.theme.label}</span>
    <select aria-label={uiCopy.theme.label} onChange={(event) => changeTheme(event.target.value)} value={theme}>
      <option value="light">{uiCopy.theme.light}</option>
      <option value="dark">{uiCopy.theme.dark}</option>
      <option value="system">{uiCopy.theme.system}</option>
    </select>
  </label>;
}
