import { expect, test } from "@playwright/test";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL and S3-compatible services");

test("separates project tabs, preserves detail navigation and history, and protects owner settings", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const origin = testInfo.project.use.baseURL as string;
  const signed = await page.request.post("/api/auth/sign-up/email", { headers: { origin }, data: { name: "Tab owner", email: `tabs-${Date.now()}@example.test`, password: "integration-password-123" } });
  expect(signed.ok()).toBe(true);
  const created = await page.request.post("/api/projects", { multipart: { title: "Project tabs fixture", description: "A short introduction", license: "MIT", isPublic: "true", rightsConfirmed: "on", cover: { name: "design.png", mimeType: "image/png", buffer: image } } });
  expect(created.status()).toBe(201);
  const { slug } = await created.json();
  const base = `/projects/${slug}`;
  // The empty-project next action must reach an open, keyboard-usable form.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    const next = page.getByRole("navigation", { name: "Project next steps" });
    await next.getByRole("link", { name: "Publish the first revision", exact: true }).press("Enter");
    await expect(page.locator("#owner-tools")).toHaveAttribute("open", "");
    await expect(page.getByRole("textbox", { name: "Revision title", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto(base);
    await page.screenshot({ path: testInfo.outputPath(`mobile-overview-${width}.png`), fullPage: true });
  }
  expect((await page.request.patch(`/api${base}`, { data: { document: "# Working guide\n\nRead this guide in Overview." } })).status()).toBe(200);
  for (let index = 0; index < 4; index++) {
    const issue = await page.request.post(`/api${base}/issues`, { data: { title: `Request ${index}`, body: "Full issue body belongs in detail", kind: "DESIGN_REQUEST" } });
    expect(issue.status()).toBe(201);
  }
  await page.goto(base);
  const nav = page.getByRole("navigation", { name: "Project sections" });
  await expect(nav.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Working guide", exact: true })).toBeVisible();
  await expect(page.getByText("Request 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Request 0", { exact: true })).toHaveCount(0);
  await expect(page.locator("#revisions, #issues, #discussions, #proposals, #releases, #owner-tools")).toHaveCount(0);
  await nav.getByRole("link", { name: /^Issues/ }).press("Enter");
  await expect(page).toHaveURL(`${origin}${base}/issues`);
  await expect(nav.getByRole("link", { name: /^Issues/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Full issue body belongs in detail", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Issue title")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "About", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "New issue", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Issue title").fill("A new focused issue");
  await page.getByLabel("Issue description").fill("A saved description");
  await page.getByRole("button", { name: "Open issue", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${base}/issues/[^/]+$`));
  await expect(page.getByRole("heading", { name: "A new focused issue", exact: true })).toBeVisible();
  const issuePath = new URL(page.url()).pathname;
  const issueId = issuePath.split("/").at(-1)!;
  await expect(nav.getByRole("link", { name: /^Issues/ })).toHaveText("Issues 5");
  await expect(nav.getByRole("link", { name: /^Issues/ })).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mark as open question", exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Remove from open questions", exact: true })).toBeVisible();
  await page.goto(base);
  const openQuestions = page.locator('section[aria-labelledby="open-questions-heading"]');
  await expect(openQuestions.getByRole("link", { name: "A new focused issue", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Project information" }).locator('section[aria-labelledby="open-questions-heading"]')).toHaveCount(1);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const rail = await page.getByRole("complementary", { name: "Project information" }).boundingBox();
    const preview = await page.locator("#preview").boundingBox();
    const questions = await openQuestions.boundingBox();
    expect(rail).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(questions).not.toBeNull();
    expect(questions!.x).toBeGreaterThanOrEqual(rail!.x);
    expect(questions!.x + questions!.width).toBeLessThanOrEqual(rail!.x + rail!.width + 1);
    if (width === 1440) expect(rail!.x).toBeGreaterThanOrEqual(preview!.x + preview!.width);
    else expect(rail!.y).toBeGreaterThanOrEqual(preview!.y + preview!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`mobile-open-questions-sidebar-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("mobile-open-questions-390.png"), fullPage: true });
  const publicVisitorContext = await browser.newContext({ baseURL: origin });
  try {
    const publicVisitor = await publicVisitorContext.newPage();
    await publicVisitor.setViewportSize({ width: 390, height: 844 });
    await publicVisitor.goto(issuePath);
    await expect(publicVisitor.getByRole("button", { name: /open question|Close issue|Reopen issue/i })).toHaveCount(0);
    await publicVisitor.goto(base);
    await expect(publicVisitor.locator('section[aria-labelledby="open-questions-heading"]').getByRole("link", { name: "A new focused issue", exact: true })).toBeVisible();

    await page.goto(issuePath);
    await page.getByLabel("Comment on A new focused issue").fill("A saved comment");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(page.getByText("A saved comment", { exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Close issue", exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Reopen issue", exact: true })).toBeVisible();
    await page.goto(base);
    await expect(openQuestions.getByRole("link", { name: "A new focused issue", exact: true })).toHaveCount(0);
    await publicVisitor.goto(issuePath);
    await expect(publicVisitor.getByText("Question resolved (issue closed)", { exact: true })).toBeVisible();
    await expect(publicVisitor.getByRole("button", { name: /open question|Close issue|Reopen issue/i })).toHaveCount(0);
    await publicVisitor.goto(base);
    await expect(publicVisitor.locator('section[aria-labelledby="open-questions-heading"]').getByRole("link", { name: "A new focused issue", exact: true })).toHaveCount(0);

    await page.goto(issuePath);
    await page.getByRole("button", { name: "Reopen issue", exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Close issue", exact: true })).toBeVisible();
    await page.goto(base);
    await expect(openQuestions.getByRole("link", { name: "A new focused issue", exact: true })).toBeVisible();
    await publicVisitor.goto(base);
    await expect(publicVisitor.locator('section[aria-labelledby="open-questions-heading"]').getByRole("link", { name: "A new focused issue", exact: true })).toBeVisible();

    // Leave the fixture closed for the existing closed-issues navigation checks below.
    await page.goto(issuePath);
    await page.getByRole("button", { name: "Close issue", exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: "Reopen issue", exact: true })).toBeVisible();
  } finally {
    await publicVisitorContext.close();
  }
  await nav.getByRole("link", { name: /^Issues/ }).click();
  await page.getByRole("navigation", { name: "Issue status" }).getByRole("link", { name: "Closed", exact: true }).click();
  await expect(page.getByRole("link", { name: /A new focused issue/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Issue status" }).getByRole("link", { name: "Closed", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(`${origin}${base}/issues`);
  await page.goForward();
  await expect(page).toHaveURL(`${origin}${base}/issues?issueStatus=closed`);
  await page.getByRole("link", { name: /A new focused issue/ }).click();
  await expect(page).toHaveURL(`${origin}${issuePath}?issueStatus=closed`);
  await page.getByRole("link", { name: "Back to issues", exact: true }).click();
  await expect(page).toHaveURL(`${origin}${base}/issues?issueStatus=closed`);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of ["revisions", "releases", "discussions", "proposals", "contributors", "forks"]) {
    await page.goto(`${base}/${section}`);
    await expect(nav.locator(`[href="${base}/${section}"]`)).toHaveAttribute("aria-current", "page");
    await expect(nav.locator(`[href="${base}/${section}"]`)).toBeInViewport();
    await expect(page.getByRole("heading", { name: section[0].toUpperCase() + section.slice(1), exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator("#project-document")).toHaveCount(0);
  }
  await page.goto(`${base}/proposals?proposalStatus=closed`);
  await expect(page.getByRole("button", { name: "Closed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Closed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto(`${base}#issues`);
  await expect(page).toHaveURL(`${origin}${base}/issues#issues`);
  await page.goto(`${base}#issue-${issueId}`);
  await expect(page).toHaveURL(`${origin}${issuePath}#issue-${issueId}`);
  await expect(page.getByText("A saved comment", { exact: true })).toBeVisible();
  await page.goto(`${base}?contributionTarget=original&baseRevision=2&relatedIssue=request#owner-tools`);
  await expect(page).toHaveURL(`${origin}${base}/revisions?contributionTarget=original&baseRevision=2&relatedIssue=request#owner-tools`);
  await expect(page.locator("#owner-tools")).toHaveAttribute("open", "");
  await expect(page.getByText("Prepare your working revision", { exact: true })).toBeVisible();
  await page.goto(`${base}?contributionTarget=original&baseRevision=2&relatedIssue=request`);
  await expect(page).toHaveURL(`${origin}${base}/revisions?contributionTarget=original&baseRevision=2&relatedIssue=request`);
  await expect(page.locator("#owner-tools")).toHaveAttribute("open", "");
  await page.goto(`${base}/settings`);
  await expect(nav.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Updated project tabs");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Updated project tabs", exact: true })).toBeVisible();
  const visitor = await browser.newContext({ baseURL: origin });
  try {
    const other = await visitor.newPage();
    await other.goto(`${base}/issues`);
    await expect(other.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
    await other.goto(`${base}/settings`);
    await expect(other.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    expect((await page.request.patch(`/api${base}`, { data: { isPublic: false } })).status()).toBe(200);
    await other.goto(`${base}/issues`);
    await expect(other.getByRole("heading", { name: "404", exact: true })).toBeVisible();
    await expect(other.getByRole("heading", { name: "Updated project tabs", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Project settings", exact: true })).toBeVisible();
  } finally { await visitor.close(); }
});
