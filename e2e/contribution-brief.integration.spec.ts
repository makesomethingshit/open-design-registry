import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_INTEGRATION, "requires isolated PostgreSQL and object storage");

test("preserves a brief across type switches and saves readable optional sections", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const origin = testInfo.project.use.baseURL as string;
  const signup = await page.request.post("/api/auth/sign-up/email", { headers: { origin }, data: { name: "Brief author", email: `brief-${crypto.randomUUID()}@example.test`, password: "integration-password-123" } });
  expect(signup.ok()).toBe(true);
  const created = await page.request.post("/api/projects", { multipart: { title: "Contribution brief example", description: "Make navigation easier to use", license: "MIT", isPublic: "true", rightsConfirmed: "on", cover: { name: "design.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") } } });
  expect(created.status()).toBe(201);
  const { slug } = await created.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${slug}/issues/new`);
  const kind = page.getByLabel("Type", { exact: true });
  await page.getByLabel("Issue title").fill("Keyboard navigation design");
  await kind.selectOption("DESIGN_REQUEST");
  await page.getByLabel("Purpose", { exact: true }).fill("Improve keyboard navigation");
  await page.getByLabel("Scope and constraints", { exact: true }).fill("Keep existing shortcuts");
  await page.getByLabel("Expected deliverables", { exact: true }).fill("A revised navigation design");
  await page.getByLabel("Review criteria", { exact: true }).fill("Usable without a mouse");
  await kind.selectOption("ISSUE");
  await expect(page.getByLabel("Purpose", { exact: true })).toBeHidden();
  await kind.selectOption("DESIGN_REQUEST");
  await expect(page.getByLabel("Purpose", { exact: true })).toHaveValue("Improve keyboard navigation");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-brief-author.png"), fullPage: true });

  // Combined prompts can exceed the API limit even though every input is valid.
  await page.getByLabel("Additional details", { exact: true }).fill("x".repeat(9900));
  await page.getByRole("button", { name: "Open issue", exact: true }).press("Enter");
  await expect(page.locator("#issue-body-error")).toContainText("10,000 characters");
  await expect(page.getByLabel("Additional details", { exact: true })).toBeFocused();
  await kind.selectOption("ISSUE");
  await expect(page.locator("#issue-body-error")).toHaveCount(0);
  await expect(page.getByLabel("Issue description", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
  await kind.selectOption("DESIGN_REQUEST");
  await page.getByRole("button", { name: "Open issue", exact: true }).press("Enter");
  await expect(page.locator("#issue-body-error")).toContainText("10,000 characters");
  await page.getByLabel("Purpose", { exact: true }).fill("Improve keyboard navigation ");
  await expect(page.locator("#issue-body-error")).toHaveCount(0);
  await page.getByLabel("Additional details", { exact: true }).fill("Preserve desktop behavior.");
  const saved = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${slug}/issues`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Open issue", exact: true }).press("Enter");
  const response = await saved;
  expect(response.status()).toBe(201);
  const request = await response.json();
  await expect(page).toHaveURL(new RegExp(`/projects/${slug}/issues/${request.id}$`));
  const expectedBody = "Purpose:\nImprove keyboard navigation\n\nScope and constraints:\nKeep existing shortcuts\n\nExpected deliverables:\nA revised navigation design\n\nReview criteria:\nUsable without a mouse\n\nAdditional details:\nPreserve desktop behavior.";
  expect(request.body).toBe(expectedBody);
  const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } });
  try {
    const visitor = await context.newPage();
    await visitor.goto(`/projects/${slug}/issues/${request.id}`);
    await expect(visitor.getByRole("heading", { name: "Keyboard navigation design", exact: true })).toBeVisible();
    await expect(visitor.getByText(expectedBody, { exact: true })).toBeVisible();
    await expect(visitor.getByRole("link", { name: "Contribute to this request", exact: true })).toHaveAttribute("href", `/projects/${slug}/contribute?relatedIssue=${request.id}`);
    await visitor.screenshot({ path: testInfo.outputPath("mobile-brief-contributor.png"), fullPage: true });
  } finally {
    await context.close();
  }

  const discussionResponse = await page.request.post(`/api/projects/${slug}/discussions`, { data: { title: "Discuss keyboard navigation", body: "Keep the existing focus order." } });
  expect(discussionResponse.status()).toBe(201);
  const discussion = await discussionResponse.json();
  await page.goto(`/projects/${slug}/discussions/${discussion.id}`);
  const work = page.getByRole("region", { name: "Create work from this discussion", exact: true });
  await work.getByRole("button", { name: "Create design request", exact: true }).press("Enter");
  const form = work.getByRole("form", { name: "Create design request", exact: true });
  await form.getByLabel("Purpose", { exact: true }).fill("Improve navigation from discussion");
  await form.getByLabel("Review criteria", { exact: true }).fill("Keyboard users can follow the focus order");
  await expect(form.getByLabel("Additional details", { exact: true })).toHaveValue("Keep the existing focus order.");
  await form.getByLabel("Additional details", { exact: true }).fill("x".repeat(9900));
  await form.getByRole("button", { name: "Create design request", exact: true }).press("Enter");
  await expect(form.locator("#derived-work-body-error")).toContainText("10,000 characters");
  await work.getByRole("button", { name: "Create issue", exact: true }).press("Enter");
  await expect(work.locator("#derived-work-body-error")).toHaveCount(0);
  await expect(work.getByLabel("Purpose", { exact: true })).toBeHidden();
  await work.getByRole("button", { name: "Create design request", exact: true }).press("Enter");
  await expect(form.getByLabel("Purpose", { exact: true })).toHaveValue("Improve navigation from discussion");
  await form.getByLabel("Additional details", { exact: true }).fill("Keep the existing focus order.");
  const derivedSave = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${slug}/issues`) && response.request().method() === "POST");
  await form.getByRole("button", { name: "Create design request", exact: true }).press("Enter");
  const derivedResponse = await derivedSave;
  expect(derivedResponse.status()).toBe(201);
  const derived = await derivedResponse.json();
  expect(derived.kind).toBe("DESIGN_REQUEST");
  expect(derived.sourceDiscussionId).toBe(discussion.id);
  expect(derived.body).toBe("Purpose:\nImprove navigation from discussion\n\nReview criteria:\nKeyboard users can follow the focus order\n\nAdditional details:\nKeep the existing focus order.");
  await page.goto(`/projects/${slug}/issues/${derived.id}`);
  await expect(page.getByText(derived.body, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mobile-brief-from-discussion.png"), fullPage: true });
});
