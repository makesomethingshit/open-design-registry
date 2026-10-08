import { expect, test } from "@playwright/test";

test("keeps public and account actions visible with keyboard disclosure and sign-out", async ({ page }, testInfo) => {
  let signedIn = true;
  let signOutCalls = 0;
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: signedIn ? { user: { name: "Designer", role: "user" } } : null }));
  await page.route("**/api/notifications", (route) => route.fulfill({ json: { unreadCount: 3 } }));
  await page.route("**/api/auth/sign-out", (route) => {
    signedIn = false;
    signOutCalls++;
    return route.fulfill({ json: { success: true } });
  });
  for (const width of [320, 390, 440, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const header = page.locator(".site-header");
    const trigger = page.getByRole("button", { name: "Account, 3 unread notifications" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("navigation", { name: "Public" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New project", exact: true })).toBeInViewport();
    await expect(page.getByRole("link", { name: "New project", exact: true })).toHaveCSS("min-height", "48px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440 || width === 440) await header.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath(`header-closed-${width}.png`) });
    await trigger.focus();
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    for (const name of ["My projects", "Starred", "Notifications, 3 unread", "Sign out"]) {
      await page.keyboard.press("Tab");
      const action = page.getByRole(name === "Sign out" ? "button" : "link", { name, exact: true });
      await expect(action).toBeFocused();
      await expect(action).toBeInViewport();
    }
    await expect(page.getByRole("link", { name: "Reports" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1440 || width === 440) {
      const panel = (await page.getByRole("navigation", { name: "Account", exact: true }).boundingBox())!;
      const headerBox = (await header.boundingBox())!;
      await page.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath(`header-open-${width}.png`), clip: { x: 0, y: 0, width, height: Math.ceil(Math.max(headerBox.height, panel.y + panel.height)) + 8 } });
    }
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await page.mouse.click(4, (await header.boundingBox())!.height + 8);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await page.setViewportSize({ width: 440, height: 900 });
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: /^Account/ }).click();
  await expect(page.getByRole("link", { name: "Notifications, 3 unread" })).toBeVisible();
  await page.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath("header-account-dark-440.png") });
  await page.getByRole("button", { name: "Sign out" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect(signOutCalls).toBe(1);
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".site-header").screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath("header-visitor-dark.png") });
});
