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

  test("defers application in E2: selection preview without Apply execution or /apply requests", async ({ page }) => {
    const workspace = await openWorkspace(page);
    let applyRequests = 0;
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      applyRequests += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "E2 must not call apply" }) });
    });

    // E2 renders no Apply CTA and no confirmation dialog.
    await expect(workspace.getByRole("button", { name: /Apply \d+ selected/ })).toHaveCount(0);
    await expect(workspace.getByText("Application runs in a later stage.")).toBeVisible();

    await workspace.getByLabel("Select Whole document for application").check();
    await expect(workspace.getByText("1 selected for a later application:")).toBeVisible();
    await expect(workspace.getByText("This replaces the entire current document.")).toBeVisible();
    await workspace.getByLabel("Select Whole document for application").uncheck();

    for (const unit of [
      { label: /Select Add A deliberately long added unit name for application copy verification for application/, id: "Add A deliberately long added unit name" },
      { label: /Select Modify A deliberately long approved poster name for responsive review verification for application/, id: "Modify A deliberately long approved poster name" },
      { label: /Select Remove A deliberately long removable unit name for application copy verification for application/, id: "Remove A deliberately long removable unit name" },
      { label: /Select Rename A deliberately long renameable unit name for application copy verification to A renamed fixture unit for application/, id: "Rename A deliberately long renameable unit name" },
    ]) {
      await workspace.getByLabel(unit.label).check();
      await expect(workspace.getByText("1 selected for a later application:")).toBeVisible();
      await expect(workspace.getByText("Unselected units in the current revision will be kept.")).toBeVisible();
      await workspace.getByLabel(unit.label).uncheck();
    }

    expect(applyRequests).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("keeps stale review affordances without an apply path", async ({ page }) => {
    const workspace = await openWorkspace(page);
    await workspace.getByLabel("Show stale revision state").check();
    await workspace.getByLabel("Select Modify A deliberately long approved poster name for responsive review verification for application").check();
    await expect(workspace.getByText("Review the latest revision. Selection is preserved; application is unavailable in this stage.")).toBeVisible();
    await workspace.getByRole("button", { name: "Review latest revision" }).click();
    // The toggle renames the button; focus returns to the same control under its new label.
    await expect(workspace.getByRole("button", { name: "Back to base comparison" })).toBeFocused();
  });

  test("keeps conflict recovery messaging on the review path", async ({ page }) => {
    const workspace = await openStaleSelection(page, ["Select Modify A deliberately long approved poster name for responsive review verification for application", "Select Whole document for application"]);
    await page.route("**/api/proposals/fixture-proposal/changes/fixture-poster", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Review the conflicting change", latestRevision: { id: "fixture-r14" }, conflictChangeIds: ["fixture-poster"] }) });
    });

    // Make the approved poster the active review target before approving it.
    await workspace.getByRole("button", { name: /^Modify A deliberately long approved poster/ }).click();
    await workspace.getByRole("button", { name: "Approve change" }).click();
    await expect(workspace.getByRole("alert")).toContainText("Review the conflicting change");
    await expect(workspace.getByText("1 selected change needs conflict review.")).toBeVisible();
    await expect(workspace.getByLabel(/Select Modify A deliberately long approved poster name for responsive review verification for application/).first()).not.toBeChecked();
    await expect(workspace.getByLabel("Select Whole document for application")).toBeChecked();
  });

  test("preserves a change-specific request draft, pending state, and late failure", async ({ page }) => {
    const workspace = await openWorkspace(page);
    const pendingChange = workspace.getByRole("button", { name: /^Modify A deliberately long pending poster/ });
    await pendingChange.click();
    await workspace.getByRole("button", { name: "Request changes" }).click();
    const dialog = page.getByRole("dialog", { name: "Request changes" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Feedback for Modify A deliberately long pending poster/)).toBeVisible();
    const draft = dialog.getByRole("textbox", { name: /Feedback for/ });
    await draft.fill("Keep this request with the pending change.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await pendingChange.click();
    await workspace.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByRole("dialog", { name: "Request changes" }).getByRole("textbox", { name: /Feedback for/ })).toHaveValue("Keep this request with the pending change.");

    let releaseResponse: (() => void) | undefined;
    let markRequest: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    const requestStarted = new Promise<void>((resolve) => { markRequest = resolve; });
    await page.route("**/api/proposals/fixture-proposal/changes/fixture-pending", async (route) => {
      markRequest?.();
      await responseReady;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture review failed" }) });
    });

    await page.getByRole("dialog", { name: "Request changes" }).getByRole("button", { name: "Submit review" }).click();
    await requestStarted;
    // The modal dialog blocks navigation while the review is pending; the failure closes the dialog
    // so the preserved-failure Retry action is reachable, and the draft is kept for reopen.
    releaseResponse?.();
    await expect(page.getByRole("dialog", { name: "Request changes" })).toHaveCount(0);
    await expect(workspace.getByRole("alert")).toContainText("Fixture review failed");

    // Retry re-sends the failed request unchanged and shows the same failure.
    await page.route("**/api/proposals/fixture-proposal/changes/fixture-pending", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture review failed" }) });
    });
    await workspace.getByRole("button", { name: "Retry" }).click();
    await expect(workspace.getByRole("alert")).toContainText("Fixture review failed");

    // Reopening the dialog shows the preserved draft for the same change.
    await pendingChange.click();
    await workspace.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByRole("dialog", { name: "Request changes" }).getByRole("textbox", { name: /Feedback for/ })).toHaveValue("Keep this request with the pending change.");
  });

  test("announces review status in a persistent live region with unit history metadata", async ({ page }) => {
    const workspace = await openWorkspace(page);
    await expect(workspace.getByRole("status").first()).toBeVisible();
    await expect(workspace.getByRole("heading", { name: "Unit review history" })).toBeVisible();
    await workspace.getByRole("button", { name: /^Modify A deliberately long approved poster/ }).click();
    await expect(workspace.getByRole("status").first()).toContainText("Approved");
  });

  test("keeps review and application selection independent in both directions", async ({ page }) => {
    const workspace = await openWorkspace(page);
    let reviewPayload: unknown;
    await page.route("**/api/proposals/fixture-proposal/changes/fixture-pending", async (route) => {
      reviewPayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "fixture-pending", reviewStatus: "APPROVED" }) });
    });
    // Approving the pending fixture change sends only the review PATCH — no application selection.
    await workspace.getByRole("button", { name: /^Modify A deliberately long pending poster/ }).click();
    await workspace.getByRole("button", { name: "Approve change" }).click();
    await expect.poll(() => reviewPayload).toEqual({ status: "APPROVED", comment: "" });
    const approvedCheckbox = workspace.getByLabel("Select Modify A deliberately long pending poster name for responsive review verification for application");
    await expect(approvedCheckbox).toHaveCount(0);

    // Selecting for application does not change the review state.
    const checkbox = workspace.getByLabel("Select Modify A deliberately long approved poster name for responsive review verification for application");
    await checkbox.check();
    await expect(checkbox.first()).toBeChecked();
    await expect(workspace.getByRole("button", { name: /Unit review history|Approve change/ }).first()).toBeVisible();
    await expect(workspace.getByText(/8 total changes/)).toContainText("1 selected");
  });

  test("names every visible application checkbox for application at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const workspace = await openWorkspace(page);
    // The change list is hidden at mobile width; select the approved poster via the picker.
    const picker = workspace.getByRole("combobox", { name: /^Change/ });
    await picker.selectOption({ label: "Modify A deliberately long approved poster name for responsive review verification" });
    const mobileCheckbox = workspace.getByRole("checkbox", { name: /for application/ });
    await expect(mobileCheckbox.first()).toBeVisible();
    for (const label of await mobileCheckbox.all()) {
      // Hidden rows also match by accessible name; only visible ones must be operable.
      if (await label.isVisible()) {
        const name = await label.evaluate((element: Element) => {
          const input = element as HTMLInputElement;
          return input.getAttribute("aria-label") ?? document.querySelector(`label[for="${input.id}"]`)?.textContent ?? input.textContent ?? "";
        });
        expect(name).toMatch(/for application/);
      }
    }
    await mobileCheckbox.first().check();
    await expect(workspace.getByText(/8 total changes/)).toContainText("1 selected");
    await workspace.getByLabel("Select all eligible approved changes for application").check();
    await expect(workspace.getByText(/8 total changes/)).toContainText("5 selected");
  });

  test("gates every application selection control on owner and open status", async ({ page }) => {
    const workspace = await openWorkspace(page);
    const selectAll = workspace.getByLabel("Select all eligible approved changes for application");

    // Owner + OPEN: individual and select-all both available.
    await expect(selectAll).toBeVisible();
    await workspace.getByLabel("Show closed proposal state").check();
    // CLOSED: select-all hidden, individual rows hidden, selection cleared.
    await expect(selectAll).toHaveCount(0);
    await expect(workspace.getByLabel(/Select Modify A deliberately long approved poster name for responsive review verification for application/)).toHaveCount(0);
    await expect(workspace.getByText(/8 total changes/)).toContainText("0 selected");
    await workspace.getByLabel("Show closed proposal state").uncheck();
    await workspace.getByLabel("Fixture owner").uncheck();
    // Non-owner: select-all hidden again.
    await expect(selectAll).toHaveCount(0);
    await expect(workspace.getByText("Only the project owner can select approved changes for application.")).toBeVisible();
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

async function openStaleSelection(page: Page, labels: string[]) {
  const workspace = await openWorkspace(page);
  await workspace.getByLabel("Show stale revision state").check();
  for (const label of labels) await workspace.getByLabel(label).check();
  await workspace.getByRole("button", { name: "Review latest revision" }).click();
  await workspace.getByLabel(/I reviewed Revision 13/).check();
  return workspace;
}
