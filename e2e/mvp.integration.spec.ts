import { expect, test, type Page } from "@playwright/test";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.describe("real PostgreSQL and S3 MVP flow", () => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL and S3-compatible services");

  test("edits About and adds, edits, previews and removes document images and tables", async ({ page, browser }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await signUp(page, `Editor owner ${suffix}`, `editor-${suffix}@example.test`, "integration-password-123");
    const created = await page.request.post("/api/projects", { multipart: {
      title: `Editor project ${suffix}`, description: "Original short description", license: "CC BY 4.0", isPublic: "true", rightsConfirmed: "on",
      cover: { name: "cover.png", mimeType: "image/png", buffer: tinyPng },
    } });
    expect(created.status()).toBe(201);
    const projectPath = `/projects/${(await created.json()).slug}`;
    await page.goto(projectPath);
    await page.getByRole("button", { name: "Edit About", exact: true }).click();
    const about = page.getByRole("form", { name: "Edit About", exact: true });
    await about.getByLabel("Short description").fill("A clearer project introduction");
    await about.getByRole("button", { name: "Save About", exact: true }).click();
    await expect(page.getByText("About saved.", { exact: true })).toBeVisible();
    await expect(page.locator("#overview aside")).toContainText("A clearer project introduction");
    await page.getByRole("button", { name: "Edit About", exact: true }).click();
    await about.getByLabel("Short description").fill("Discarded About change");
    await about.getByRole("button", { name: "Cancel About changes", exact: true }).click();
    await expect(page.locator("#overview aside")).not.toContainText("Discarded About change");
    await page.getByRole("button", { name: "Add document", exact: true }).click();
    const document = page.locator("#project-document");
    const source = document.getByLabel("Project document (Markdown)");
    await expect(source).toBeFocused();
    await source.fill("# Project guide\n\nHow to contribute.");
    await source.press("Control+End");
    await document.getByRole("button", { name: "Insert table", exact: true }).click();
    const table = document.getByRole("region", { name: "Table editor", exact: true });
    await table.getByLabel("Header 1", { exact: true }).fill("Tool");
    await table.getByLabel("Header 2", { exact: true }).fill("Access");
    await table.getByLabel("Row 1, column 1", { exact: true }).fill("Penpot");
    await table.getByLabel("Row 1, column 2", { exact: true }).fill("Open");
    await table.getByRole("button", { name: "Add row", exact: true }).click();
    await table.getByLabel("Row 2, column 1", { exact: true }).fill("Figma");
    await table.getByLabel("Row 2, column 2", { exact: true }).fill("Community");
    await table.getByRole("button", { name: "Apply table", exact: true }).click();
    await document.getByRole("button", { name: "Edit table 1", exact: true }).click();
    await table.getByLabel("Row 1, column 2", { exact: true }).fill("Open source");
    await table.getByRole("button", { name: "Apply table", exact: true }).click();
    await document.locator('input[type="file"]').setInputFiles({ name: "sketch.png", mimeType: "image/png", buffer: tinyPng });
    await expect(source).toHaveValue(/!\[sketch\]\(\/api\/assets\?key=/);
    const imageUrl = (await source.inputValue()).match(/!\[sketch\]\(([^)]+)\)/)![1];
    await expect(source).toBeEnabled();
    await source.evaluate((element, bytes) => {
      const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, [...tinyPng]);
    await expect(source).toHaveValue(/!\[pasted\]\(\/api\/assets\?key=/);
    await expect(source).toBeEnabled();
    await source.evaluate((element, bytes) => {
      const data = new DataTransfer(); data.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
      element.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
    }, [...tinyPng]);
    await expect(source).toHaveValue(/!\[dropped\]\(\/api\/assets\?key=/);
    await document.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(document.getByRole("columnheader", { name: "Tool", exact: true })).toBeVisible();
    await expect(document.getByRole("cell", { name: "Open source", exact: true })).toBeVisible();
    await expect(document.getByRole("img", { name: "sketch", exact: true })).toBeVisible();
    const visitorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const visitor = await visitorContext.newPage();
      expect((await visitor.request.get(imageUrl)).status()).toBe(404);
      expect((await page.request.get(imageUrl)).status()).toBe(200);
      await document.getByRole("button", { name: "Save document", exact: true }).click();
      await expect(document.getByText("Project document saved.", { exact: true })).toBeVisible();
      expect((await visitor.request.get(imageUrl)).status()).toBe(200);
      expect((await page.request.patch(`/api${projectPath}`, { data: { isPublic: false } })).status()).toBe(200);
      expect((await visitor.request.get(imageUrl)).status()).toBe(404);
      expect((await page.request.get(imageUrl)).status()).toBe(200);
      expect((await page.request.patch(`/api${projectPath}`, { data: { isPublic: true, rightsConfirmed: true } })).status()).toBe(200);
      await page.reload();
      await visitor.goto(projectPath);
      await expect(visitor.locator("#project-document").getByRole("cell", { name: "Open source", exact: true })).toBeVisible();
      await expect(visitor.getByRole("button", { name: "Edit About", exact: true })).toHaveCount(0);
      await expect(visitor.getByRole("button", { name: "Edit document", exact: true })).toHaveCount(0);
      const forbidden = await visitor.request.post(`/api${projectPath}/document-images`, { multipart: { image: { name: "forbidden.png", mimeType: "image/png", buffer: tinyPng } } });
      expect(forbidden.status()).toBe(401);
      await page.setViewportSize({ width: 390, height: 844 });
      await document.getByRole("button", { name: "Edit document", exact: true }).press("Enter");
      while (await document.getByRole("button", { name: "Remove image 1", exact: true }).count()) await document.getByRole("button", { name: "Remove image 1", exact: true }).click();
      await document.getByRole("button", { name: "Remove table 1", exact: true }).click();
      await document.getByRole("button", { name: "Cancel document changes", exact: true }).click();
      await expect(document.getByRole("img", { name: "sketch", exact: true })).toBeVisible();
      await expect(document.getByRole("columnheader", { name: "Tool", exact: true })).toBeVisible();
      await document.getByRole("button", { name: "Edit document", exact: true }).click();
      while (await document.getByRole("button", { name: "Remove image 1", exact: true }).count()) await document.getByRole("button", { name: "Remove image 1", exact: true }).click();
      await document.getByRole("button", { name: "Remove table 1", exact: true }).click();
      await document.getByRole("button", { name: "Save document", exact: true }).click();
      await expect(document.getByText("Project document saved.", { exact: true })).toBeVisible();
      expect((await visitor.request.get(imageUrl)).status()).toBe(404);
      await page.reload();
      await expect(document.getByRole("img", { name: "sketch", exact: true })).toHaveCount(0);
      await expect(document.locator("table")).toHaveCount(0);
      await expect(document.getByRole("heading", { name: "Project guide", exact: true })).toBeVisible();
      const bounds = await document.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    } finally { await visitorContext.close(); }
  });

  test("reads the project document after artwork and About, before contribution activity", async ({ page, browser }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await signUp(page, `Guide owner ${suffix}`, `guide-${suffix}@example.test`, "integration-password-123");
    const response = await page.request.post("/api/projects", { multipart: {
      title: `Guide project ${suffix}`, description: "A short project summary", license: "CC BY 4.0", isPublic: "true", rightsConfirmed: "on",
      cover: { name: "cover.png", mimeType: "image/png", buffer: tinyPng },
    } });
    expect(response.status()).toBe(201);
    const projectPath = `/projects/${(await response.json()).slug}`;
    await page.goto(projectPath);
    await expect(page.locator("#project-document")).toContainText("Share the project's goals, design principles and ways to contribute.");
    await expect(page.getByRole("button", { name: "Add document", exact: true })).toBeVisible();

    const visitorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const visitor = await visitorContext.newPage();
      await visitor.setViewportSize({ width: 390, height: 844 });
      await visitor.goto(projectPath);
      const document = visitor.locator("#overview #project-document");
      await expect(document).toContainText("Read About for a short summary");
      await expect(document).toContainText("A revision has not been published yet.");
      await expect(document.getByRole("link", { name: "Revisions", exact: true })).toHaveCount(0);
      await expect(document.getByRole("button", { name: "Add document", exact: true })).toHaveCount(0);

      const published = await page.request.post(`/api${projectPath}/revisions`, { multipart: {
        title: "Initial design", changeDescription: "Publish the first design", sourceUrl: "https://example.test/design.fig",
        previews: { name: "design.png", mimeType: "image/png", buffer: tinyPng }, altTexts: "Initial design preview",
      } });
      expect(published.status()).toBe(201);
      await visitor.reload();
      await expect(document.getByRole("link", { name: "Revisions", exact: true })).toHaveAttribute("href", `${projectPath}/revisions`);
      await expect(document).toContainText("for the current design.");
      await expect(document).not.toContainText("A revision has not been published yet.");

      const saved = await page.request.patch(`/api${projectPath}`, { data: { document: "# Design principles\n\nKeep the work open and explain how to contribute." } });
      expect(saved.status()).toBe(200);
      for (const width of [1440, 390]) {
        await visitor.setViewportSize({ width, height: 900 });
        await visitor.goto(projectPath);
        await expect(document.getByRole("heading", { name: "Design principles" })).toBeVisible();
        const artwork = await visitor.locator("#preview").boundingBox();
        const about = await visitor.locator("#overview aside").boundingBox();
        const guide = await document.boundingBox();
        const activity = await visitor.getByRole("heading", { name: "Looking for contributions" }).boundingBox();
        expect(guide!.y).toBeGreaterThanOrEqual(Math.max(artwork!.y + artwork!.height, about!.y + about!.height));
        expect(guide!.y + guide!.height).toBeLessThanOrEqual(activity!.y);
        expect(guide!.x).toBeGreaterThanOrEqual(0);
        expect(guide!.x + guide!.width).toBeLessThanOrEqual(width);
      }
    } finally {
      await visitorContext.close();
    }
  });

  test("edits the project document in Overview with keyboard access and cancellation", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await signUp(page, `Document owner ${suffix}`, `document-${suffix}@example.test`, "integration-password-123");
    const response = await page.request.post("/api/projects", { multipart: {
      title: `Document project ${suffix}`, license: "CC BY 4.0", isPublic: "true", rightsConfirmed: "on",
      cover: { name: "cover.png", mimeType: "image/png", buffer: tinyPng },
    } });
    expect(response.status()).toBe(201);
    const projectPath = `/projects/${(await response.json()).slug}`;
    await page.goto(projectPath);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#owner-tools")).toHaveCount(0);
    await page.getByRole("button", { name: "Add document", exact: true }).click();
    const field = page.getByLabel("Project document (Markdown)");
    await expect(field).toBeFocused();
    await expect(field).toBeInViewport();
    await field.fill("# Saved document");
    await page.getByRole("button", { name: "Save document", exact: true }).click();
    await expect(page.getByText("Project document saved.")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(projectPath);
    await page.waitForLoadState("networkidle");
    const editLink = page.getByRole("button", { name: "Edit document", exact: true });
    await editLink.press("Enter");
    await expect(field).toBeFocused();
    await expect(field).toBeInViewport();
    await expect(field).toHaveValue("# Saved document");
    await field.fill("Unsaved changes");
    await page.getByRole("button", { name: "Cancel document changes", exact: true }).click();
    await editLink.click();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("# Saved document");
  });

  test("uploads, publishes, restores a revision, forks it, and delivers owner notifications", async ({ page }) => {
    test.setTimeout(300_000);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = "integration-password-123";
    const ownerEmail = `owner-${suffix}@example.test`;
    const projectTitle = `Integration project ${suffix}`;
    const forkTitle = `Integration fork ${suffix}`;
    const issueTitle = `Integration issue ${suffix}`;
    const sourceBytes = Buffer.from("PK\\x03\\x04integration-source");

    await signUp(page, `Owner ${suffix}`, ownerEmail, password);
    await page.goto("/projects/new");
    await page.getByLabel("Title").fill(projectTitle);
    await page.getByLabel("Description").fill("Real storage integration flow");
    await page.locator('input[name="cover"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: tinyPng });
    await page.locator('input[name="rightsConfirmed"]').check();
    const createProjectResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/projects" && response.request().method() === "POST";
    });
    await page.getByRole("button", { name: "Create project" }).click();
    const createProjectResponse = await createProjectResponsePromise;
    expect(createProjectResponse.status()).toBe(201);
    await expect(page).toHaveURL(/\/projects\/[^/]+$/, { timeout: 15_000 });

    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    const projectPath = new URL(page.url()).pathname;
    const slug = projectPath.split("/").pop();
    expect(slug).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/explore?q=${encodeURIComponent(projectTitle)}`);
    await expect(page.getByRole("status").filter({ hasText: `Search: ${projectTitle}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit search" })).toHaveAttribute("href", "#global-search-input");
    const mobilePreview = page.getByRole("link", { name: `View ${projectTitle}` });
    await expect(mobilePreview.locator("img")).toHaveAttribute("alt", `${projectTitle} cover`);
    const mobilePreviewBox = await mobilePreview.boundingBox();
    expect(mobilePreviewBox).not.toBeNull();
    expect(mobilePreviewBox!.y).toBeLessThan(844);
    await expect(page.locator("article").filter({ hasText: projectTitle }).getByText("Active", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Edit search" }).click();
    const globalSearch = page.locator("#global-search-input");
    await expect(globalSearch).toBeFocused();
    await globalSearch.fill("Real storage");
    await globalSearch.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Search: Real storage" })).toBeVisible();
    await expect(page.getByRole("link", { name: projectTitle, exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/explore?q=${encodeURIComponent(projectTitle)}`);
    const desktopPreview = page.getByRole("link", { name: `View ${projectTitle}` });
    await expect(desktopPreview.locator("img")).toBeVisible();
    const desktopPreviewBox = await desktopPreview.boundingBox();
    expect(desktopPreviewBox).not.toBeNull();
    expect(desktopPreviewBox!.y).toBeLessThan(900);
    await page.goto(`/explore?q=${encodeURIComponent(projectTitle)}&license=${encodeURIComponent("CC BY 4.0")}`);
    await expect(page.getByRole("link", { name: projectTitle, exact: true })).toBeVisible();
    await expect(page.getByLabel("License")).toHaveValue("CC BY 4.0");
    await page.goto(`/explore?q=${encodeURIComponent(projectTitle)}&license=MIT`);
    await expect(page.getByRole("heading", { name: "No projects match these filters" })).toBeVisible();
    const emptyResult = page.getByRole("status").filter({ hasText: "No projects match these filters" });
    await expect(emptyResult.getByRole("link", { name: "Clear filters" })).toBeVisible();
    await emptyResult.getByRole("link", { name: "Clear filters" }).press("Enter");
    await expect(page).toHaveURL(/\/explore$/);
    await page.goto(`/explore?q=${encodeURIComponent("Real storage integration flow")}`);
    await expect(page.getByRole("link", { name: projectTitle, exact: true })).toBeVisible();
    await page.goto(projectPath);
    await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: /^Revisions/ }).click();
    await page.waitForLoadState("networkidle");
    await page.locator("#owner-tools > summary").click();

    await page.locator("form.revision-publish-form input[name=title]").fill("Initial revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Upload the first source and previews");
    await page.locator('form.revision-publish-form input[name="tool"]').fill("Penpot");
    await page.locator('form.revision-publish-form input[name="tags"]').fill("ui, mobile");
    await page.locator('input[name="sources"]').setInputFiles({ name: "source.zip", mimeType: "application/zip", buffer: sourceBytes });
    await page.getByLabel("Kind for source.zip").selectOption("asset");
    await page.locator('input[name="previews"]').setInputFiles([
      { name: "design.png", mimeType: "image/png", buffer: tinyPng },
      { name: "preview.html", mimeType: "text/html", buffer: Buffer.from("<main><h1>Integration preview</h1></main>") },
    ]);
    await page.getByLabel("Alt text for design.png").fill("Design image preview");
    await page.getByLabel("Alt text for preview.html").fill("HTML design preview");
    await page.getByRole("button", { name: "Publish revision" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/revisions/1$`));
    await expect(page.getByRole("heading", { name: "Initial revision" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "HTML previews" })).toBeVisible();
    await expect(page.locator('iframe[title="HTML design preview"]')).toBeVisible();
    const filteredExplore = `/explore?${new URLSearchParams({ q: projectTitle, license: "CC BY 4.0", tool: "penpot", tag: "ui", sort: "recent" })}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(filteredExplore);
    await expect(page.getByRole("link", { name: projectTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: `Search: ${projectTitle}` })).toBeVisible();
    await expect(page.locator('form input[name="tool"]')).toHaveValue("penpot");
    await expect(page.locator('form input[name="tag"]')).toHaveValue("ui");
    await expect(page.locator('form select[name="license"]')).toHaveValue("CC BY 4.0");
    await expect(page.locator('form select[name="sort"]')).toHaveValue("recent");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const filters = page.locator("details").first();
    const filtersSummary = filters.locator("summary");
    await filtersSummary.focus();
    await expect(filtersSummary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(filters).not.toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(filters).toHaveAttribute("open", "");
    const clearFilters = page.getByRole("link", { name: "Clear filters" });
    await clearFilters.focus();
    await expect(clearFilters).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/explore$/);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(filteredExplore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/projects/${slug}/revisions/1`);
    const sourceLink = page.getByRole("list", { name: "Revision source files" }).getByRole("listitem").filter({ hasText: "source.zip" }).getByRole("link", { name: "Download" });
    await expect(sourceLink).toHaveAttribute("href", new RegExp(`/api/projects/${slug}/revisions/1/files/[^/]+$`));
    const sourceResponse = await page.request.get(await sourceLink.getAttribute("href") as string);
    expect(sourceResponse.status()).toBe(200);
    const originalBytes = await sourceResponse.body();
    expect(originalBytes.length).toBeGreaterThan(0);
    expect(originalBytes).toEqual(sourceBytes);

    await page.goto(`/projects/${slug}`);
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    await page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: /^Revisions/ }).click();
    await page.waitForLoadState("networkidle");
    await page.locator("#owner-tools > summary").click();
    await page.locator("form.revision-publish-form input[name=title]").fill("Second revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Make a second revision before restoring the first");
    await page.locator('input[name="sources"]').setInputFiles({ name: "source-v2.zip", mimeType: "application/zip", buffer: Buffer.from("PK\\x03\\x04changed-integration-source") });
    await page.getByLabel("Unit identity").selectOption({ label: "source.zip · Asset" });
    await page.locator('input[name="previews"]').setInputFiles({ name: "design-v2.png", mimeType: "image/png", buffer: tinyPng });
    await page.getByLabel("Alt text for design-v2.png").fill("Second design preview");
    await page.getByRole("button", { name: "Publish revision" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/revisions/2$`));

    const firstRevisionUrl = new URL(page.url());
    firstRevisionUrl.pathname = `/projects/${slug}/revisions/1`;
    await page.goto(firstRevisionUrl.toString());
    await expect(page.getByRole("heading", { name: "Restore this revision" })).toBeVisible();
    await page.getByRole("button", { name: "Restore as new revision" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/revisions/3$`));
    const restoredRevisionUrl = page.url();
    await expect(page.getByRole("heading", { name: "Restored: Initial revision" })).toBeVisible();
    const revisionsResponse = await page.request.get(`/api/projects/${slug}/revisions`);
    expect(revisionsResponse.status()).toBe(200);
    const revisions = await revisionsResponse.json() as Array<{ number: number; title: string; parentId: string | null }>;
    expect(revisions.map((revision) => revision.number)).toEqual([1, 2, 3]);
    expect(revisions.find((revision) => revision.number === 1)?.title).toBe("Initial revision");
    expect(revisions.find((revision) => revision.number === 3)?.parentId).toBeTruthy();

    // Changing project settings must not rewrite the license of published revisions.
    const licenseChange = await page.request.patch(`/api/projects/${slug}`, { data: { license: "MIT" } });
    expect(licenseChange.status()).toBe(200);
    await page.reload();
    await expect(page.getByText("Revision license: CC BY 4.0", { exact: true })).toBeVisible();

    const signOutResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/auth/sign-out" && response.request().method() === "POST";
    });
    await page.getByRole("button", { name: "Sign out" }).click();
    const signOutResponse = await signOutResponsePromise;
    expect(signOutResponse.status()).toBe(200);
    const sessionResponse = await page.request.get("/api/auth/get-session");
    expect(sessionResponse.status()).toBe(200);
    const session = await sessionResponse.json() as { user?: unknown } | null;
    expect(session?.user ?? null).toBeNull();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await signUp(page, `Forker ${suffix}`, `forker-${suffix}@example.test`, password);
    await page.goto(projectPath);
    await page.goto(`${projectPath}/issues/new`);
    await page.getByLabel("Issue title").fill(issueTitle);
    await page.getByLabel("Issue description").fill("A real user found a problem");
    await page.getByRole("button", { name: "Open issue" }).click();
    await expect(page.getByRole("heading", { name: issueTitle })).toBeVisible();
    await page.goto(`/projects/${slug}/contribute?baseRevision=3`);
    const relatedIssue = page.getByLabel("Related issue");
    await relatedIssue.selectOption({ label: `Issue · ${issueTitle}` });
    const relatedIssueId = await relatedIssue.inputValue();
    await page.getByRole("link", { name: "Fork Revision 3 to start" }).click();
    await expect(page.getByRole("heading", { name: "Start a contribution" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore as new revision" })).toHaveCount(0);
    await page.getByLabel("Fork project title").fill(forkTitle);
    await page.locator('input[name="rightsConfirmed"]').check();
    await page.getByRole("button", { name: "Create fork" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/contribute\\?`));
    const returnedToContribution = new URL(page.url());
    expect(returnedToContribution.searchParams.get("baseRevision")).toBe("3");
    expect(returnedToContribution.searchParams.get("relatedIssue")).toBe(relatedIssueId);
    expect(returnedToContribution.searchParams.get("sourceRevision")).toBe("1");
    await expect(page.getByRole("status").filter({ hasText: "This fork is still an unchanged copy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to proposal" })).toBeDisabled();
    const workingProjectLink = page.getByRole("link", { name: "Open working project and publish a revision" });
    const workingProjectUrl = new URL(await workingProjectLink.getAttribute("href") as string, page.url());
    const forkSlug = workingProjectUrl.pathname.split("/")[2];
    const forkPath = `/projects/${forkSlug}`;
    expect(workingProjectUrl.searchParams.get("contributionTarget")).toBe(slug);
    expect(workingProjectUrl.searchParams.get("baseRevision")).toBe("3");
    expect(workingProjectUrl.searchParams.get("relatedIssue")).toBe(relatedIssueId);
    await workingProjectLink.click();
    await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Prepare your working revision" })).toBeVisible();
    await expect(page.locator("#owner-tools")).toHaveAttribute("open", "");
    await page.waitForLoadState("networkidle");
    await page.locator("form.revision-publish-form input[name=title]").fill("Contribution revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Revise the forked source for a proposal");
    await page.getByLabel("Source URL").fill("https://example.com/forked-source-v2.zip");
    await page.locator('input[name="previews"]').setInputFiles({ name: "design-v2.png", mimeType: "image/png", buffer: tinyPng });
    await page.getByLabel("Alt text for design-v2.png").fill("Revised design preview");
    await page.getByRole("button", { name: "Publish revision" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/contribute\\?`));
    const returnedAfterPublish = new URL(page.url());
    expect(returnedAfterPublish.searchParams.get("baseRevision")).toBe("3");
    expect(returnedAfterPublish.searchParams.get("relatedIssue")).toBe(relatedIssueId);
    expect(returnedAfterPublish.searchParams.get("sourceProject")).toBe(forkSlug);
    expect(returnedAfterPublish.searchParams.get("sourceRevision")).toBe("2");
    await expect(page.getByLabel("Source revision", { exact: true })).toContainText(`${forkSlug} · r2 · Contribution revision`);
    await page.getByRole("button", { name: "Continue with whole document" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/proposals/new\\?`));
    await expect(page.getByLabel("Related issue")).toHaveValue(relatedIssueId);
    await expect(page.locator(".proposal-form")).toContainText("Whole-document only.");
    await expect(page.locator(".proposal-form .file-input-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create proposal" })).toBeEnabled();

    const forkRevisionsResponse = await page.request.get(`/api${forkPath}/revisions`);
    expect(forkRevisionsResponse.status()).toBe(200);
    const forkRevisions = await forkRevisionsResponse.json();
    expect(forkRevisions).toHaveLength(2);
    expect(forkRevisions[0]).toMatchObject({ number: 1, parentId: null, license: "CC BY 4.0", title: "Restored: Initial revision" });
    expect(forkRevisions[0].previews).toHaveLength(2);
    await page.goto(`${forkPath}/revisions/1`);
    const forkSourceLink = page.getByRole("list", { name: "Revision source files" }).getByRole("listitem").filter({ hasText: "source.zip" }).getByRole("link", { name: "Download" });
    await expect(forkSourceLink).toHaveAttribute("href", new RegExp(`/api/projects/${forkSlug}/revisions/1/files/[^/]+$`));
    const forkSourceUrl = await forkSourceLink.getAttribute("href") as string;
    const forkDownload = await page.request.get(forkSourceUrl);
    expect(forkDownload.status()).toBe(200);
    expect(await forkDownload.body()).toEqual(originalBytes);
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, ownerEmail, password);
    await expect(page.getByRole("link", { name: /Activity, 2 unread/ })).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    const issueNotification = page.getByRole("listitem").filter({ hasText: issueTitle });
    const forkNotification = page.getByRole("listitem").filter({ hasText: "forked" });
    await expect(issueNotification).toBeVisible();
    await expect(forkNotification).toBeVisible();
    await issueNotification.getByRole("button", { name: "Mark as read" }).click();
    await expect(page.getByRole("link", { name: /Activity, 1 unread/ })).toBeVisible();
    await forkNotification.getByRole("button", { name: "Mark as read" }).click();
    await expect(page.getByText("Unread notifications 0")).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();

    // A fork owns independent asset references even after upstream becomes private.
    expect((await page.request.patch(`/api/projects/${slug}`, { data: { isPublic: false } })).status()).toBe(200);
    await signOut(page);
    expect((await page.request.get(`/api/projects/${slug}/revisions`)).status()).toBe(404);
    expect((await page.request.get(`/api${forkPath}/revisions`)).status()).toBe(200);
    const preservedDownload = await page.request.get(forkSourceUrl);
    expect(preservedDownload.status()).toBe(200);
    expect(await preservedDownload.body()).toEqual(originalBytes);
    for (const preview of forkRevisions[0].previews) {
      expect((await page.request.get(preview.url)).status()).toBe(200);
    }
    // Once both projects are private, anonymous access must close again.
    await signIn(page, `forker-${suffix}@example.test`, password);
    expect((await page.request.patch(`/api${forkPath}`, { data: { isPublic: false } })).status()).toBe(200);
    await signOut(page);
    expect((await page.request.get(forkSourceUrl)).status()).toBe(404);
  });
  test("a first contributor follows a public request through feedback, resubmission, and application", async ({ page, browser }, testInfo) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = "integration-password-123";
    const contributorEmail = `first-contributor-${suffix}@example.test`;
    const requestTitle = `Improve the mobile header ${suffix}`;
    const ownerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: { width: 1440, height: 900 } });
    const owner = await ownerContext.newPage();
    owner.on("pageerror", (error) => browserErrors.push(error.message));
    owner.setDefaultTimeout(20_000);
    const capture = async (name: string) => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
    };
    try {
      await signUp(owner, "Project owner", `request-owner-${suffix}@example.test`, password);
      const created = await owner.request.post("/api/projects", { multipart: {
        title: `Open posters ${suffix}`, description: "A public poster design seeking a clearer mobile header", license: "CC BY 4.0", isPublic: "true", rightsConfirmed: "true",
        cover: { name: "poster.png", mimeType: "image/png", buffer: tinyPng },
      } });
      expect(created.status()).toBe(201);
      const { slug } = await created.json() as { slug: string };
      const projectPath = `/projects/${slug}`;
      await owner.goto(`${projectPath}/revisions?contributionTarget=${slug}&baseRevision=1#owner-tools`);
      await publishWork(owner, "Initial design", `https://example.com/${suffix}/original.penpot`);
      // This read intermittently receives ECONNRESET in CI.
      // Retry transport resets only; HTTP failures must still fail the test.
      const initialRevisionsResponse = await owner.request.get(`/api${projectPath}/revisions`, { maxRetries: 2 });
      expect(initialRevisionsResponse.status()).toBe(200);
      const revisions = await initialRevisionsResponse.json();
      const opened = await owner.request.post(`/api${projectPath}/issues`, { data: { title: requestTitle, body: "Make the title easier to read on a phone.", kind: "DESIGN_REQUEST", revisionId: revisions[0].id } });
      expect(opened.status()).toBe(201);
      const { id: requestId } = await opened.json() as { id: string };

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/contribute?q=${encodeURIComponent(requestTitle)}`);
      await page.getByRole("link", { name: requestTitle }).click();
      await expect(page.getByRole("heading", { name: "Before you contribute" })).toBeVisible();
      await expect(page.getByText("A Fork creates your own public work project.", { exact: false })).toBeVisible();
      await capture("01-request-mobile.png");
      await page.getByRole("link", { name: "Contribute to this request" }).press("Enter");
      await expect(page).toHaveURL(/\/login\?next=/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(`${projectPath}/contribute?relatedIssue=${requestId}`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "New here? Create an account" }).click();
      await page.getByLabel("Name").fill("First contributor");
      await page.getByLabel("Email").fill(contributorEmail);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(new RegExp(`${projectPath}/contribute\\?`));
      await expect(page.getByLabel("Related issue")).toHaveValue(requestId);
      await expect(page.getByRole("heading", { name: "Start with your own work copy" })).toBeVisible();
      await page.getByRole("link", { name: "Fork Revision 1 to start" }).click();
      await expect(page.getByText("Your Fork creates a public project linked to this original.", { exact: false })).toBeVisible();
      await page.getByLabel("Fork project title").fill(`My poster work ${suffix}`);
      await page.locator('input[name="rightsConfirmed"]').check();
      await page.getByRole("button", { name: "Create fork" }).click();
      await expect(page.getByRole("heading", { name: "Your Fork is ready. Edit it next." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue to proposal" })).toBeDisabled();
      const forkUrl = new URL(page.url());
      const forkSlug = forkUrl.searchParams.get("sourceProject")!;
      expect(forkUrl.searchParams.get("relatedIssue")).toBe(requestId);
      await capture("02-fork-next-step-mobile.png");
      await page.getByRole("link", { name: "Open working project and publish a revision" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Before you publish" })).toBeVisible();
      await expect(page.getByText("After publishing, you return to the original project's Contribute screen", { exact: false })).toBeVisible();
      await publishWork(page, "Readable mobile header", `https://example.com/${suffix}/edited.penpot`);
      await expect(page).toHaveURL(new RegExp(`${projectPath}/contribute\\?`));
      expect(new URL(page.url()).searchParams.get("sourceRevision")).toBe("2");
      await page.getByRole("button", { name: "Continue with whole document" }).click();
      await expect(page.getByRole("status").filter({ hasText: "After you submit" })).toBeVisible();
      await page.getByLabel("Title").fill("Improve mobile header");
      await page.getByLabel("What changed?").fill("Made the poster title larger on mobile.");
      await page.getByLabel("Why?").fill("The Design request asks for a readable header.");
      await page.getByRole("button", { name: "Create proposal" }).click();
      await expect(page).toHaveURL(/\/proposals\/cm[a-z0-9]+$/);
      await expect(page.getByRole("heading", { name: "Waiting for owner review" })).toBeVisible();
      const firstProposalPath = new URL(page.url()).pathname;
      const firstProposalId = firstProposalPath.split("/").at(-1)!;
      await expect(page.getByRole("link", { name: "Prepare revised work" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Approve change" })).toHaveCount(0);

      await owner.goto(firstProposalPath);
      await expect(owner.getByRole("heading", { name: "Review this proposed change" })).toBeVisible();
      await owner.getByRole("button", { name: "Request changes", exact: true }).click();
      await owner.getByRole("textbox", { name: /^Feedback for/ }).fill("Increase the contrast of the title too.");
      await owner.getByRole("button", { name: "Submit review" }).click();
      await expect(owner.getByRole("heading", { name: "Changes requested: revise your work" })).toBeVisible();
      await expect(owner.getByRole("link", { name: "Prepare revised work" })).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("Increase the contrast of the title too.").first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "Changes requested: revise your work" })).toBeVisible();
      await capture("03-feedback-mobile.png");
      await page.getByRole("link", { name: "Prepare revised work" }).click();
      const revisionReturn = new URL(page.url());
      expect(revisionReturn.pathname).toBe(`/projects/${forkSlug}/revisions`);
      expect(revisionReturn.searchParams.get("relatedIssue")).toBe(requestId);
      expect(revisionReturn.searchParams.get("baseRevision")).toBe("1");
      await publishWork(page, "Readable, high-contrast header", `https://example.com/${suffix}/revised.penpot`);
      await page.getByRole("button", { name: "Continue with whole document" }).click();
      await expect(page.getByRole("heading", { name: "Propose changes" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const preparedProposalPath = new URL(page.url()).pathname + new URL(page.url()).search;
      await signOut(page);
      await expect(page).toHaveURL(/\/$/);
      await page.goto(preparedProposalPath);
      await expect(page).toHaveURL(/\/login\?next=/);
      expect(new URL(page.url()).searchParams.get("next")).toBe(preparedProposalPath);
      await page.waitForLoadState("networkidle");
      await page.getByLabel("Email").fill(contributorEmail);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByLabel("Related issue")).toHaveValue(requestId);
      await expect(page.getByRole("combobox", { name: /^From/ })).toContainText("Revision 3");
      await page.getByLabel("Title").fill("Improve mobile header and contrast");
      await page.getByLabel("What changed?").fill("Added the requested title contrast.");
      await page.getByLabel("Why?").fill("Address the owner's feedback.");
      await page.getByRole("button", { name: "Create proposal" }).click();
      await expect(page).toHaveURL(/\/proposals\/cm[a-z0-9]+$/);
      const revisedProposalPath = new URL(page.url()).pathname;
      expect(revisedProposalPath).not.toBe(firstProposalPath);
      expect((await (await page.request.get(`/api/proposals/${firstProposalId}`)).json()).status).toBe("CHANGES_REQUESTED");
      await owner.goto(revisedProposalPath);
      await owner.waitForLoadState("networkidle");
      const approvalResponse = owner.waitForResponse((response) => new URL(response.url()).pathname.startsWith(`/api${revisedProposalPath}/changes/`) && response.request().method() === "PATCH");
      await owner.getByRole("button", { name: "Approve change" }).click();
      expect((await approvalResponse).status()).toBe(200);
      await expect(owner.getByRole("heading", { name: "Approved, awaiting application" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Approved, awaiting application" })).toBeVisible();
      expect(await (await page.request.get(`/api${projectPath}/revisions`)).json()).toHaveLength(1);
      await page.setViewportSize({ width: 1440, height: 900 });
      await capture("04-approved-desktop.png");
      await owner.getByLabel("Select all eligible approved changes for application").check();
      await owner.getByRole("button", { name: "Apply 1 selected changes", exact: true }).click();
      await owner.getByRole("dialog").getByRole("button", { name: "Apply 1 selected changes", exact: true }).click();
      await expect(owner.getByRole("heading", { name: "Applied to the original" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Applied to the original" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Review latest revision" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Next step for this change" })).toContainText("The owner added this change to a new Revision");
      const appliedRevisions = await (await page.request.get(`/api${projectPath}/revisions`)).json();
      expect(appliedRevisions).toHaveLength(2);
      expect(appliedRevisions[0].sourceUrl).toBe(`https://example.com/${suffix}/original.penpot`);
      expect(appliedRevisions[1].sourceUrl).toBe(`https://example.com/${suffix}/revised.penpot`);
      await capture("05-applied-desktop.png");
      await page.setViewportSize({ width: 390, height: 844 });
      const nextStep = page.getByRole("region", { name: "Next step for this change" });
      await expect(nextStep.getByRole("link", { name: "View Revision 2" })).toBeVisible();
      expect(await nextStep.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await capture("06-applied-mobile.png");
      await nextStep.getByRole("link", { name: "View Revision 2" }).click();
      await expect(page).toHaveURL(new RegExp(`${projectPath}/revisions/2$`));
      expect(browserErrors).toEqual([]);
    } finally {
      await ownerContext.close();
    }
  });
});

async function publishWork(page: Page, title: string, sourceUrl: string) {
  await page.waitForLoadState("networkidle");
  await page.locator("form.revision-publish-form input[name=title]").fill(title);
  await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill(title);
  await page.getByLabel("Source URL").fill(sourceUrl);
  await page.locator('input[name="previews"]').setInputFiles({ name: "design.png", mimeType: "image/png", buffer: tinyPng });
  await page.getByLabel("Alt text for design.png").fill(title);
  await page.getByRole("button", { name: "Publish revision" }).click();
  await expect(page).toHaveURL(/\/contribute\?/);
}

async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function signOut(page: Page) {
  const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/sign-out" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign out" }).click();
  expect((await responsePromise).status()).toBe(200);
  const sessionResponse = await page.request.get("/api/auth/get-session");
  expect(sessionResponse.status()).toBe(200);
  expect((await sessionResponse.json())?.user ?? null).toBeNull();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}
