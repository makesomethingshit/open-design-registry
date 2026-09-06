import { expect, test, type Page } from "@playwright/test";

test.describe("proposal review regression fixtures", () => {
  test.setTimeout(90_000);

  test("keeps preview failure and dimensions scoped to the asset being viewed", async ({ page }) => {
    const cacheFixture = await openSection(page, "preview-cache-heading");
    await expect(cacheFixture.getByText("Preview could not be loaded.")).toBeVisible();

    await cacheFixture.getByRole("button", { name: "Show healthy replacement" }).click();
    await expect(cacheFixture.getByText("Preview could not be loaded.")).toHaveCount(0);
    await expect(cacheFixture.getByRole("radio", { name: "Overlay" })).toBeEnabled();

    await cacheFixture.getByRole("button", { name: "Show mismatched replacement" }).click();
    await expect(cacheFixture.getByRole("radio", { name: "Overlay" })).toBeDisabled();

    const workspace = await openWorkspace(page);
    await expect(workspace.getByRole("radio", { name: "Overlay" })).toBeEnabled();
    await workspace.getByLabel("Show stale revision state").check();
    await workspace.getByRole("button", { name: "Review latest revision" }).click();
    await expect(workspace.getByRole("radio", { name: "Overlay" })).toBeDisabled();
  });

  test("warns for a whole-document replacement while preserving every unit application copy and payload", async ({ page }) => {
    const workspace = await openWorkspace(page);
    let payload: unknown;
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture apply failed" }) });
    });

    await workspace.getByLabel("Select Whole document").check();
    await workspace.getByRole("button", { name: "Apply 1 selected" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This replaces the entire current document.");
    await expect(dialog).not.toContainText("Unselected units in the current revision will be kept.");
    await dialog.getByRole("button", { name: "Apply 1 selected" }).click();
    await expect.poll(() => payload).toEqual({ changeIds: ["fixture-document"] });
    await expect(dialog.getByRole("alert")).toContainText("Fixture apply failed");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await workspace.getByLabel("Select Whole document").uncheck();

    for (const unit of [
      { label: /Select Add A deliberately long added unit/, id: "fixture-add" },
      { label: /Select Modify A deliberately long approved poster/, id: "fixture-poster" },
      { label: /Select Remove A deliberately long removable unit/, id: "fixture-remove" },
      { label: /Select Rename A deliberately long renameable unit/, id: "fixture-rename" },
    ]) {
      payload = undefined;
      await workspace.getByLabel(unit.label).check();
      await workspace.getByRole("button", { name: "Apply 1 selected" }).click();
      await expect(page.getByRole("dialog")).toContainText("Unselected units in the current revision will be kept.");
      await page.getByRole("dialog").getByRole("button", { name: "Apply 1 selected" }).click();
      await expect.poll(() => payload).toEqual({ changeIds: [unit.id] });
      await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
      await workspace.getByLabel(unit.label).uncheck();
    }
  });

  test("keeps Apply 409 feedback visible and restores review focus", async ({ page }) => {
    const workspace = await openStaleApply(page, ["Select Modify A deliberately long approved poster"]);
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Review the latest revision before applying these selected changes", latestRevision: { id: "fixture-r14" } }) });
    });

    await page.getByRole("dialog").getByRole("button", { name: "Apply 1 selected" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(workspace.getByRole("alert")).toContainText("Review the latest revision before applying these selected changes");
    await expect(workspace.getByLabel(/I reviewed Revision 13/)).toHaveCount(0);
    await expect(workspace.getByLabel(/Select Modify A deliberately long approved poster/)).toBeChecked();
    await expect(workspace.getByRole("button", { name: "Review latest revision" })).toBeFocused();
  });

  test("keeps safe selections after a conflicting Apply 409", async ({ page }) => {
    const workspace = await openStaleApply(page, ["Select Modify A deliberately long approved poster", "Select Whole document"]);
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Review the conflicting change", latestRevision: { id: "fixture-r14" }, conflictChangeIds: ["fixture-poster"] }) });
    });

    await page.getByRole("dialog").getByRole("button", { name: "Apply 2 selected" }).click();
    await expect(workspace.getByRole("alert")).toContainText("Review the conflicting change");
    await expect(workspace.getByLabel(/Select Modify A deliberately long approved poster/)).not.toBeChecked();
    await expect(workspace.getByLabel("Select Whole document")).toBeChecked();
    await expect(workspace.getByText("1 selected change needs conflict review.")).toBeVisible();
  });

  test("preserves a change-specific request draft, pending state, and late failure", async ({ page }) => {
    const workspace = await openWorkspace(page);
    const pendingChange = workspace.getByRole("button", { name: /^Modify A deliberately long pending poster/ });
    const approvedChange = workspace.getByRole("button", { name: /^Modify A deliberately long approved poster/ });
    await pendingChange.click();
    await workspace.getByRole("button", { name: "Request changes" }).click();
    const draft = workspace.getByRole("textbox", { name: "Review comment" });
    await draft.fill("Keep this request with the pending change.");
    await approvedChange.click();
    await pendingChange.click();
    await expect(draft).toHaveValue("Keep this request with the pending change.");

    let releaseResponse: (() => void) | undefined;
    let markRequest: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    const requestStarted = new Promise<void>((resolve) => { markRequest = resolve; });
    await page.route("**/api/proposals/fixture-proposal/changes/fixture-pending", async (route) => {
      markRequest?.();
      await responseReady;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture review failed" }) });
    });

    await workspace.getByRole("button", { name: "Send request" }).click();
    await requestStarted;
    await approvedChange.click();
    releaseResponse?.();
    await expect(workspace.getByRole("heading", { name: /^Modify A deliberately long approved poster/ })).toBeVisible();
    await expect(workspace.getByRole("alert")).toHaveCount(0);
    await pendingChange.click();
    await expect(workspace.getByRole("alert")).toContainText("Fixture review failed");
    await expect(draft).toHaveValue("Keep this request with the pending change.");
  });

  test("keeps selection tracks and the tablet inspector placement at each breakpoint", async ({ page }, testInfo) => {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      const workspace = await openWorkspace(page);
      const rows = workspace.locator("li");
      await expect(rows).toHaveCount(8);
      await workspace.getByLabel("Fixture owner").uncheck();
      await expect(rows.first()).toHaveCSS("grid-template-columns", /px minmax\(0, 1fr\)|px [\d.]+px/);
      await workspace.screenshot({ path: testInfo.outputPath(`review-non-owner-${viewport.width}.png`) });
      await workspace.getByLabel("Fixture owner").check();
      await workspace.screenshot({ path: testInfo.outputPath(`review-owner-${viewport.width}.png`) });

      const inspector = workspace.locator("aside").nth(1);
      if (viewport.width >= 1280) await expect(inspector).toHaveCSS("grid-column-start", "3");
      else await expect(inspector).toHaveCSS("grid-column-start", "2");
    }

    const workspace = await openWorkspace(page);
    await workspace.getByLabel("Show stale revision state").check();
    const stale = workspace.locator("[data-stale]").locator(":scope > div").first();
    await expect(stale).toHaveCSS("grid-column-start", "1");
    await expect(stale).toHaveCSS("grid-column-end", "-1");
    await workspace.screenshot({ path: testInfo.outputPath("review-stale-768.png") });
  });
});

async function openWorkspace(page: Page) {
  await page.goto("/design-system");
  const workspace = page.locator("section").filter({ has: page.locator("#review-workspace-heading") });
  await expect(workspace).toBeVisible();
  return workspace;
}

async function openSection(page: Page, headingId: string) {
  await page.goto("/design-system");
  const section = page.locator("section").filter({ has: page.locator(`#${headingId}`) });
  await expect(section).toBeVisible();
  return section;
}

async function openStaleApply(page: Page, labels: string[]) {
  const workspace = await openWorkspace(page);
  await workspace.getByLabel("Show stale revision state").check();
  for (const label of labels) await workspace.getByLabel(label).check();
  await workspace.getByRole("button", { name: "Review latest revision" }).click();
  await workspace.getByLabel(/I reviewed Revision 13/).check();
  await workspace.getByRole("button", { name: `Apply ${labels.length} selected` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  return workspace;
}
