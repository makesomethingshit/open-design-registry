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

test("project creation requires sign-in before any inputs or files", async ({ page }, testInfo) => {
  await page.goto("/projects/new");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects%2Fnew$/);
  await expect(page.getByText("Sign in or create an account before starting your project. You will return to the project form.")).toBeVisible();
  await expect(page.locator('input[name="cover"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("sign-in-before-writing.png"), fullPage: true });
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects%2Fnew$/);
});

test("sign-up and sign-in return to project creation and an expired session keeps the full draft", async ({ page }, testInfo) => {
  test.skip(!process.env.E2E_INTEGRATION, "requires PostgreSQL authentication");
  test.setTimeout(90_000);
  const email = `project-auth-${crypto.randomUUID()}@example.test`;
  const password = "project-auth-password-123";
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Name").fill("Project author");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByLabel("Title").fill("Preserved project draft");
  await page.getByLabel("Description", { exact: true }).fill("Draft with a selected cover");
  await page.getByLabel("License", { exact: true }).selectOption("MIT");
  const cover = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await page.locator('input[name="cover"]').setInputFiles({ name: "draft-cover.png", mimeType: "image/png", buffer: cover });
  await page.getByLabel("Public project", { exact: true }).uncheck();
  await page.locator('input[name="rightsConfirmed"]').check();

  // Expire the shared browser session without navigating or unmounting the draft.
  const signedOutStatus = await page.evaluate(async () => (await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  expect(signedOutStatus).toBe(200);
  const submit = page.getByRole("button", { name: "Create project", exact: true });
  await submit.click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Your session has expired");
  await expect(page).toHaveURL(/\/projects\/new$/);
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("expired-session-draft.png"), fullPage: true });

  const recoveryLink = page.getByRole("link", { name: "Sign in in a new tab", exact: true });
  await expect(recoveryLink).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await recoveryLink.click();
  const login = await popupPromise;
  await login.waitForLoadState("networkidle");
  await login.getByLabel("Email").fill(email);
  await login.getByLabel("Password").fill(password);
  await login.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(login).toHaveURL(/\/projects\/new$/);
  await login.close();

  await expect(page.getByLabel("Title")).toHaveValue("Preserved project draft");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Draft with a selected cover");
  await expect(page.getByLabel("License", { exact: true })).toHaveValue("MIT");
  await expect(page.getByLabel("Public project", { exact: true })).not.toBeChecked();
  await expect(page.locator('input[name="rightsConfirmed"]')).toBeChecked();
  const selectedCover = await page.locator('input[name="cover"]').evaluate(async (input: HTMLInputElement) => {
    const file = input.files![0];
    return { name: file.name, type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) };
  });
  expect(selectedCover).toEqual({ name: "draft-cover.png", type: "image/png", bytes: Array.from(cover) });

  // Capture the retry payload without requiring object storage in this regression.
  await page.route("/api/projects", async (route) => {
    const request = route.request();
    const form = await new Request(request.url(), { method: "POST", headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!) }).formData();
    expect(form.get("title")).toBe("Preserved project draft");
    expect(form.get("description")).toBe("Draft with a selected cover");
    expect(form.get("license")).toBe("MIT");
    expect(form.get("isPublic")).toBeNull();
    expect(form.get("rightsConfirmed")).toBe("on");
    const file = form.get("cover") as File;
    expect(file.name).toBe("draft-cover.png");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(cover);
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Draft retry verified" }) });
  });
  await submit.click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Draft retry verified");
  await expect(recoveryLink).toHaveCount(0);
});
