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
    await section.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath(`stage-c-${viewport.width}.png`) });
  }
});

test("reveals the project action without moving the card or its neighbors", async ({ page, browser }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/design-system");
    const link = page.getByRole("link", { name: "View Aster coffee identity" });
    await link.scrollIntoViewIfNeeded();
    const card = link.locator("xpath=..");
    const label = link.getByText("Open project");
    const before = await card.boundingBox();
    const neighbors = await page.getByRole("link", { name: /View (Portrait poster|Landscape spread)/ }).all();
    const neighborBoxes = await Promise.all(neighbors.map((neighbor) => neighbor.boundingBox()));
    await expect(label).toHaveCSS("opacity", "0");
    await link.hover();
    await expect(label).toHaveCSS("opacity", "1");
    expect(await card.boundingBox()).toEqual(before);
    expect(await Promise.all(neighbors.map((neighbor) => neighbor.boundingBox()))).toEqual(neighborBoxes);
    await card.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath(`card-hover-${width}.png`) });
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await link.focus();
    await expect(label).toHaveCSS("opacity", "1");
    await expect(label).toHaveCSS("transition-property", "none");
    expect(await card.boundingBox()).toEqual(before);
    await card.screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath(`card-focus-${width}.png`) });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#project-components-heading$/);
  }
  const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const mobile = await touch.newPage();
    await mobile.goto(`${new URL(page.url()).origin}/design-system`);
    const link = mobile.getByRole("link", { name: "View Aster coffee identity" });
    await link.scrollIntoViewIfNeeded();
    await expect(link.getByText("Open project")).toHaveCSS("opacity", "1");
    await link.locator("xpath=..").screenshot({ style: "nextjs-portal { display: none; }", path: testInfo.outputPath("card-touch.png") });
  } finally {
    await touch.close();
  }
});
