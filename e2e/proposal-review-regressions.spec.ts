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

  test("confirms, applies selected changes, and clears only the applied selection", async ({ page }) => {
    const workspace = await openWorkspace(page);
    const posterLabel = "Select Modify A deliberately long approved poster name for responsive review verification for application";
    const addLabel = "Select Add A deliberately long added unit name for application copy verification for application";
    let applyRequests = 0;
    let releaseResponse: (() => void) | undefined;
    const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      applyRequests += 1;
      await responseReady;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ revision: { id: "fixture-r14", number: 14, title: "Accepted fixture" } }) });
    });

    await workspace.getByLabel(posterLabel).check();
    await workspace.getByLabel(addLabel).check();
    await workspace.getByRole("button", { name: "Apply 2 selected changes" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("These changes will create a new immutable revision.");
    await expect(dialog).toContainText("Other proposal changes will remain unapplied.");
    const submit = dialog.getByRole("button", { name: /Apply 2 selected changes|Applying/ });
    await submit.click();
    await submit.dispatchEvent("click");
    await expect(dialog).toContainText("Applying…");
    await expect.poll(() => applyRequests).toBe(1);
    releaseResponse?.();

    await expect(workspace.getByRole("status").filter({ hasText: "Applied 2 changes · r14" })).toBeVisible();
    await expect(workspace.getByText("Applied · r14").first()).toBeVisible();
    await expect(workspace.getByLabel(posterLabel)).toHaveCount(0);
    await expect(workspace.getByLabel(addLabel)).toHaveCount(0);
    await expect(workspace.getByText(/8 total changes/)).toContainText("0 selected");
  });

  test("reconciles an unknown result from server state without creating a duplicate revision", async ({ page }) => {
    const workspace = await openWorkspace(page);
    const posterLabel = "Select Modify A deliberately long approved poster name for responsive review verification for application";
    let applyRequests = 0;
    let proposalReads = 0;
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      applyRequests += 1;
      await route.abort("failed");
    });
    await page.route("**/api/proposals/fixture-proposal", async (route) => {
      proposalReads += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ changeSet: { changes: [{ id: "fixture-poster", appliedRevision: { id: "fixture-r14", number: 14, title: "Accepted fixture" } }] } }) });
    });

    await workspace.getByLabel(posterLabel).check();
    await workspace.getByRole("button", { name: "Apply 1 selected changes" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply 1 selected changes" }).click();
    await expect(workspace.getByRole("status").filter({ hasText: "Applied 1 change · r14" })).toBeVisible();
    await expect.poll(() => applyRequests).toBe(1);
    await expect.poll(() => proposalReads).toBe(1);
    await expect(workspace.getByLabel(posterLabel)).toHaveCount(0);
  });

  test("preserves selection on a known apply failure and allows retry", async ({ page }) => {
    const workspace = await openWorkspace(page);
    const posterLabel = "Select Modify A deliberately long approved poster name for responsive review verification for application";
    let applyRequests = 0;
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      applyRequests += 1;
      if (applyRequests === 1) {
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture apply failed" }) });
        return;
      }
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ revision: { id: "fixture-r14", number: 14, title: "Accepted fixture" } }) });
    });

    await workspace.getByLabel(posterLabel).check();
    await workspace.getByRole("button", { name: "Apply 1 selected changes" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Apply 1 selected changes" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Fixture apply failed");
    await expect(dialog.getByRole("alert")).toContainText("Your selection has been preserved.");
    await expect(dialog.getByRole("button", { name: "Retry application" })).toBeVisible();
    await expect(workspace.getByLabel(posterLabel)).toBeChecked();

    await dialog.getByRole("button", { name: "Retry application" }).click();
    await expect(workspace.getByRole("status").filter({ hasText: "Applied 1 change · r14" })).toBeVisible();
    await expect.poll(() => applyRequests).toBe(2);
  });

  test("warns for a whole-document replacement while preserving every unit application copy and payload", async ({ page }) => {
    const workspace = await openWorkspace(page);
    let payload: unknown;
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture apply failed" }) });
    });

    await workspace.getByLabel("Select Whole document for application").check();
    await workspace.getByRole("button", { name: "Apply 1 selected" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This replaces the entire current document.");
    await expect(dialog).not.toContainText("Unselected units in the current revision will be kept.");
    await dialog.getByRole("button", { name: "Apply 1 selected" }).click();
    await expect.poll(() => payload).toEqual({ changeIds: ["fixture-document"] });
    await expect(dialog.getByRole("alert")).toContainText("Fixture apply failed");

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await workspace.getByLabel("Select Whole document for application").uncheck();

    for (const unit of [
      { label: /Select Add A deliberately long added unit name for application copy verification for application/, id: "fixture-add" },
      { label: /Select Modify A deliberately long approved poster name for responsive review verification for application/, id: "fixture-poster" },
      { label: /Select Remove A deliberately long removable unit name for application copy verification for application/, id: "fixture-remove" },
      { label: /Select Rename A deliberately long renameable unit name for application copy verification to A renamed fixture unit for application/, id: "fixture-rename" },
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
    const workspace = await openStaleApply(page, ["Select Modify A deliberately long approved poster name for responsive review verification for application"]);
    await expect(workspace).toContainText("Latest revision changed: r11 → r13.");
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Review the latest revision before applying these selected changes", latestRevision: { id: "fixture-r14" } }) });
    });

    await page.getByRole("dialog").getByRole("button", { name: "Apply 1 selected" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(workspace.getByRole("alert")).toContainText("Review the latest revision before applying these selected changes");
    await expect(workspace.getByLabel(/I reviewed Revision 13/)).toHaveCount(0);
    await expect(workspace.getByLabel(/Select Modify A deliberately long approved poster name for responsive review verification for application/)).toBeChecked();
    await expect(workspace.getByRole("button", { name: "Review latest revision" })).toBeFocused();
  });

  test("keeps safe selections after a conflicting Apply 409", async ({ page }) => {
    const workspace = await openStaleApply(page, ["Select Modify A deliberately long approved poster name for responsive review verification for application", "Select Whole document for application"]);
    await page.route("**/api/proposals/fixture-proposal/apply", async (route) => {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Review the conflicting change", latestRevision: { id: "fixture-r14" }, conflictChangeIds: ["fixture-poster"] }) });
    });

    await page.getByRole("dialog").getByRole("button", { name: "Apply 2 selected" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(workspace.getByRole("alert")).toContainText("Review the conflicting change");
    await expect(workspace.getByLabel(/Select Modify A deliberately long approved poster name for responsive review verification for application/).first()).not.toBeChecked();
    await expect(workspace.getByLabel("Select Whole document for application")).toBeChecked();
    await expect(workspace.getByText("1 selected change needs conflict review.")).toBeVisible();
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
    // The failure is shown inside the dialog with the draft preserved; the in-dialog
    // Submit review re-sends the failed request unchanged.
    releaseResponse?.();
    const failureDialog = page.getByRole("dialog", { name: "Request changes" });
    await expect(failureDialog).toBeVisible();
    await expect(failureDialog.getByRole("alert")).toContainText("Fixture review failed");
    await expect(failureDialog.getByText("Could not update review.")).toBeVisible();
    await expect(failureDialog.getByRole("textbox", { name: /Feedback for/ })).toHaveValue("Keep this request with the pending change.");
    // Edit the draft to B, then use the in-dialog Retry: it must re-send request A unchanged.
    await failureDialog.getByRole("textbox", { name: /Feedback for/ }).fill("Edited draft B, must not change the retried request.");
    const retriedPayloads: unknown[] = [];
    await page.route("**/api/proposals/fixture-proposal/changes/fixture-pending", async (route) => {
      retriedPayloads.push(route.request().postDataJSON());
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Fixture review failed" }) });
    });
    await failureDialog.getByRole("button", { name: "Retry" }).click();
    await expect.poll(() => retriedPayloads).toEqual([{ status: "CHANGES_REQUESTED", comment: "Keep this request with the pending change." }]);
    // The B draft is preserved untouched by the Retry of A.
    await expect(failureDialog.getByRole("textbox", { name: /Feedback for/ })).toHaveValue("Edited draft B, must not change the retried request.");
    // Submitting now sends the edited B draft, distinct from the Retry path.
    await failureDialog.getByRole("button", { name: "Submit review" }).click();
    await expect.poll(() => retriedPayloads).toEqual([
      { status: "CHANGES_REQUESTED", comment: "Keep this request with the pending change." },
      { status: "CHANGES_REQUESTED", comment: "Edited draft B, must not change the retried request." },
    ]);
    await failureDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(workspace.getByRole("alert")).toContainText("Fixture review failed");

    // The outside Retry also re-sends the preserved failed request.
    await workspace.getByRole("button", { name: "Retry" }).click();
    await expect(workspace.getByRole("alert")).toContainText("Fixture review failed");

    // Reopening the dialog shows the preserved (edited) draft for the same change.
    await pendingChange.click();
    await workspace.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByRole("dialog", { name: "Request changes" }).getByRole("textbox", { name: /Feedback for/ })).toHaveValue("Edited draft B, must not change the retried request.");
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
