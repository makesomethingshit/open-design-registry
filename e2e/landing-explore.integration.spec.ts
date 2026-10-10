import { expect, test } from "@playwright/test";

test("keeps landing, public Explore, and My projects distinct on desktop and mobile", async ({ page }, testInfo) => {
  test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL and S3-compatible services");
  test.setTimeout(120_000);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const title = `Explore project ${suffix}`;
  const signup = await page.request.post("/api/auth/sign-up/email", { data: { name: "Explore designer", email: `explore-${suffix}@example.test`, password: "integration-password-123" } });
  expect(signup.ok()).toBe(true);
  await page.goto("/");
  const cover = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#163c37";
    context.fillRect(0, 0, 800, 600);
    context.fillStyle = "#c9f5de";
    context.font = "bold 64px sans-serif";
    context.fillText("Open design", 64, 160);
    context.fillRect(64, 240, 300, 240);
    context.fillStyle = "#7cbca6";
    context.fillRect(400, 240, 300, 240);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  for (const isPublic of [true, false]) {
    const response = await page.request.post("/api/projects", { multipart: {
      title: isPublic ? title : `Private ${suffix}`, description: "Source files, revisions, and contributions in one project.", license: "CC BY 4.0", isPublic: String(isPublic), rightsConfirmed: "on",
      cover: { name: "cover.png", mimeType: "image/png", buffer: Buffer.from(cover, "base64") },
    } });
    expect(response.status()).toBe(201);
  }

  for (const signedIn of [true, false]) {
    if (!signedIn) {
      await page.getByRole("button", { name: /^Account/ }).click();
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    }
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Good design. Built in the open." })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`landing-${signedIn}-${viewport.width}.png`), fullPage: true });
      await expect(page.locator("#projects")).toHaveCount(0);
      await page.getByRole("link", { name: "Explore projects", exact: true }).click();
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page.getByRole("heading", { name: "Explore projects" })).toBeVisible();
      await expect(page.getByText("Find public design projects with source files, published revisions, and ways to contribute.")).toBeVisible();
      // Other integration workers create public projects; isolate this viewport fixture through search.
      await page.getByLabel("Search public projects").fill(suffix);
      await page.getByRole("search", { name: "Explore projects" }).getByRole("button", { name: "Search", exact: true }).click();
      const preview = page.getByRole("link", { name: `View ${title}` });
      await expect(preview).toBeInViewport();
      await expect(preview.locator("img")).toBeVisible();
      await expect(page.getByRole("link", { name: `Private ${suffix}`, exact: true })).toHaveCount(0);
      const positions = await Promise.all([
        page.locator("#projects-heading"), page.getByText("Find public design projects with source files, published revisions, and ways to contribute."), page.getByRole("search", { name: "Explore projects" }), preview, page.getByRole("link", { name: "Find design requests" }),
      ].map(async (locator) => (await locator.boundingBox())!.y));
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`explore-${signedIn}-${viewport.width}.png`), fullPage: true });
      await preview.click();
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();

      await page.goto("/feed");
      await page.waitForLoadState("networkidle");
      const search = page.locator("#global-search-input");
      await search.fill(title);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
      await expect(search).toHaveValue(title);
      await search.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/explore\\?q=${encodeURIComponent(title).replace(/%20/g, "\\+")}`));
      await expect(search).toHaveValue(title);
      await expect(page.getByLabel("Search public projects")).toHaveValue(title);
      await expect(page.getByText(`Search: ${title}`, { exact: false })).toBeInViewport();
      await expect(preview).toBeInViewport();
      await page.getByRole("link", { name: "Edit search" }).focus();
      await page.keyboard.press("Enter");
      await expect(search).toBeFocused();
      await expect(search).toHaveValue(title);
      await search.fill(`No match ${suffix}`);
      await search.press("Enter");
      await expect(page.getByRole("heading", { name: "No projects match these filters" })).toBeInViewport();
      await page.goBack();
      await expect(search).toHaveValue(title);
      await expect(page.getByLabel("Search public projects")).toHaveValue(title);
      await page.goForward();
      await expect(search).toHaveValue(`No match ${suffix}`);
      await expect(page.getByLabel("Search public projects")).toHaveValue(`No match ${suffix}`);
      await expect(page.getByRole("heading", { name: "No projects match these filters" })).toBeInViewport();
      await page.getByRole("link", { name: "Go to results" }).click();
      await expect(page.locator("#projects-heading")).toBeFocused();
      await expect(search).toHaveValue(`No match ${suffix}`);

      await page.goto(`/explore?q=${encodeURIComponent(title)}`);
      await expect(search).toHaveValue(title);
      await expect(page.getByLabel("Search public projects")).toHaveValue(title);
      await expect(page.getByText(`Search: ${title}`, { exact: false })).toBeInViewport();
      await expect(preview).toBeInViewport();

      const directNoMatch = `Direct no match ${suffix}`;
      await page.goto(`/explore?q=${encodeURIComponent(directNoMatch)}`);
      await expect(search).toHaveValue(directNoMatch);
      await expect(page.getByLabel("Search public projects")).toHaveValue(directNoMatch);
      await expect(page.getByText(`Search: ${directNoMatch}`, { exact: false })).toBeInViewport();
      await expect(page.getByRole("heading", { name: "No projects match these filters" })).toBeInViewport();
    }
    await page.goto("/projects");
    if (signedIn) {
      await expect(page.getByRole("heading", { name: "My projects" })).toBeVisible();
      await expect(page.getByRole("link", { name: `Private ${suffix}`, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("href", "/explore");
    } else await expect(page).toHaveURL(/\/login$/);
  }
});
