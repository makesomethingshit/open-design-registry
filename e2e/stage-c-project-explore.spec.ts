import { expect, test } from "@playwright/test";

test("keeps Project and Explore components readable across gallery breakpoints", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/design-system");
    const section = page.locator("section").filter({ has: page.locator("#project-components-heading") });
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    const portrait = page.getByAltText("Portrait poster cover");
    const landscape = page.getByAltText("Landscape spread cover");
    await expect(portrait).toBeVisible();
    await expect(landscape).toBeVisible();
    await expect(portrait).toHaveAttribute("loading", "eager");
    await expect(landscape).toHaveAttribute("loading", "lazy");

    const frame = portrait.locator("xpath=..");
    const box = await frame.boundingBox();
    if (!box) throw new Error("Portrait gallery frame is not measurable");
    expect(box.width / box.height).toBeCloseTo(4 / 3, 1);
    await expect(page.getByRole("heading", { name: "Fixture project overview" })).toBeVisible();
    await section.screenshot({ path: testInfo.outputPath(`stage-c-${viewport.width}.png`) });
  }
});
