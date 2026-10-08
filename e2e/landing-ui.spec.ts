import { expect, test } from "@playwright/test";

test("shows source-led landing and contextual creation without overflow", async ({ page }, testInfo) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }));
  for (const theme of ["light", "dark"]) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      const hero = page.getByRole("region", { name: "Good design. Built in the open." });
      await expect(hero.getByRole("link")).toHaveCount(1);
      await expect(hero.getByRole("link", { name: "Explore projects" })).toHaveAttribute("href", "/explore");
      const create = page.getByRole("link", { name: "Create a project" });
      await expect(create).toHaveAttribute("href", "/projects/new");
      const example = page.getByRole("figure");
      const exampleBox = (await example.boundingBox())!;
      expect((await create.boundingBox())!.y).toBeGreaterThan(exampleBox.y + exampleBox.height);
      await expect(example.getByRole("img")).toBeVisible();
      await expect(example.getByText("aster-identity.zip")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath(`landing-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.getByRole("link", { name: "Create a project" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects%2Fnew$/);
});
