import { expect, test } from "@playwright/test";

test("shows a loaded request preview and an explicit failed-image fallback", async ({ page }) => {
  for (let visit = 0; visit < 2; visit++) {
    await page.goto("/design-system");
    const preview = page.getByAltText("Request preview fixture");
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const visibleArtwork = await preview.evaluate((image) => {
      const box = image.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === image;
    });
    expect(visibleArtwork).toBe(true);
  }
  await page.route("**/landing-aster.svg", (route) => route.abort());
  await page.reload();
  const fixture = page.locator("section").filter({ has: page.locator("#request-preview-heading") });
  await fixture.scrollIntoViewIfNeeded();
  await expect(fixture.getByText("Preview couldn't load. Open the request for details.")).toBeVisible();
});

test("renders project and editor Octicons and preserves keyboard actions", async ({ page }, testInfo) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: null }));
  const methods: string[] = [];
  await page.route("**/api/projects/fixture-project/star", (route) => {
    methods.push(`star:${route.request().method()}`);
    return route.fulfill({ json: { starred: true } });
  });
  await page.route("**/api/projects/fixture-project/watch", (route) => {
    methods.push(`watch:${route.request().method()}`);
    return route.fulfill({ json: { watched: true } });
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/design-system");
    const fixture = page.getByRole("group", { name: "Project actions and document editor fixture" });
    await fixture.scrollIntoViewIfNeeded();
    for (const name of ["Star", "Watch", "Contribute", "Fork", "Write", "Preview", "Add image", "Insert table"]) {
      const button = fixture.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const icon = button.locator("svg");
      const size = ["Star", "Watch", "Contribute", "Fork"].includes(name) ? 24 : 16;
      await expect(icon).toHaveAttribute("viewBox", `0 0 ${size} ${size}`);
      await expect(icon).toHaveAttribute("aria-hidden", "true");
      expect((await icon.boundingBox())!.width).toBe(size);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fixture.screenshot({ style: "nextjs-portal { display: none; } .site-header, .skip-link { visibility: hidden; }", path: testInfo.outputPath(`project-icons-${width}.png`) });
    await fixture.getByRole("button", { name: "Star", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(fixture.getByRole("button", { name: "Starred", exact: true })).toHaveAttribute("aria-pressed", "true");
    await fixture.getByRole("button", { name: "Watch", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(fixture.getByRole("button", { name: "Watching", exact: true })).toHaveAttribute("aria-pressed", "true");
    await fixture.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(fixture.getByRole("heading", { name: "Project document" })).toBeVisible();
    await fixture.getByRole("button", { name: "Write", exact: true }).click();
    await expect(fixture.getByRole("textbox", { name: "Project document" })).toBeVisible();
  }
  expect(methods).toEqual(["star:PUT", "watch:PUT", "star:PUT", "watch:PUT"]);
});

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
