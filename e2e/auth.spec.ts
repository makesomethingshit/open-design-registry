import { expect, test } from "@playwright/test";

test("visitor can switch between sign-in and sign-up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await page.getByRole("button", { name: "처음 오셨나요? 가입" }).click();
  await expect(page.getByRole("heading", { name: "계정 만들기" })).toBeVisible();
  await expect(page.getByLabel("이름")).toBeVisible();
  await page.getByRole("button", { name: "이미 계정이 있어요" }).click();
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
});
