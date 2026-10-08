import { expect, test } from "@playwright/test";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.describe("release publish recovery", () => {
  test.skip(!process.env.E2E_INTEGRATION, "requires PostgreSQL and S3-compatible S3rver");

  test("retries a response loss with the same logical publish request", async ({ page }) => {
    const suffix = crypto.randomUUID();
    const email = `release-${suffix}@example.test`;
    await page.goto("/login");
    await page.getByRole("button", { name: "New here? Create an account" }).click();
    await page.getByLabel("Name").fill("Release owner");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("release-password-123");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Account/ })).toBeVisible();

    const created = await page.request.post("/api/projects", { multipart: { title: `Release project ${suffix}`, description: "", license: "MIT", isPublic: "true", rightsConfirmed: "on", cover: { name: "cover.png", mimeType: "image/png", buffer: tinyPng } } });
    expect(created.status()).toBe(201);
    const projectPath = `/projects/${(await created.json()).slug}`;
    const revision = await page.request.post(`/api${projectPath}/revisions`, { multipart: { title: "Initial revision", changeDescription: "Initial revision", sourceUrl: `https://example.test/${suffix}/design.fig`, previews: { name: "design.png", mimeType: "image/png", buffer: tinyPng }, altTexts: "Initial design" } });
    expect(revision.status()).toBe(201);

    await page.goto(`${projectPath}/releases/new`);
    await page.getByLabel("Release title").fill("First release");
    await page.getByLabel("Revision 1 · Initial revision").check();
    let aborted = false;
    const requestIds: string[] = [];
    await page.route("**/api/projects/*/releases", async (route) => {
      requestIds.push(route.request().postDataJSON().requestId);
      if (!aborted) {
        aborted = true;
        const response = await route.fetch();
        await response.body();
        await route.abort("connectionreset");
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Publish release", exact: true }).click();
    await expect(page.locator('section[role="alert"]')).toContainText("Try again");
    await page.getByRole("button", { name: "Publish release", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${projectPath}/releases/1$`));
    await expect(page.getByRole("heading", { name: "First release", exact: true })).toBeVisible();
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toBe(requestIds[1]);
    await page.goto(`${projectPath}/releases`);
    await expect(page.getByRole("link", { name: /Release 1 .*First release/ })).toHaveCount(1);
  });
});
