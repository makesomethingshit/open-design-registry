import { expect, test } from "@playwright/test";

test("visitor can switch between sign-in and sign-up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
