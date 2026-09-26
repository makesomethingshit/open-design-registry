import { expect, test, type Page } from "@playwright/test";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.describe("real PostgreSQL and S3 MVP flow", () => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL and S3-compatible services");

  test("uploads, publishes, restores a revision, forks it, and delivers owner notifications", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = "integration-password-123";
    const ownerEmail = `owner-${suffix}@example.test`;
    const projectTitle = `Integration project ${suffix}`;
    const forkTitle = `Integration fork ${suffix}`;
    const issueTitle = `Integration issue ${suffix}`;
    const sourceBytes = Buffer.from("PK\\x03\\x04integration-source");

    await signUp(page, `Owner ${suffix}`, ownerEmail, password);
    await page.goto("/projects/new");
    await page.getByLabel("제목").fill(projectTitle);
    await page.getByLabel("설명").fill("Real storage integration flow");
    await page.locator('input[name="cover"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: tinyPng });
    await page.locator('input[name="rightsConfirmed"]').check();
    const createProjectResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/projects" && response.request().method() === "POST";
    });
    await page.getByRole("button", { name: "생성하기" }).click();
    const createProjectResponse = await createProjectResponsePromise;
    expect(createProjectResponse.status()).toBe(201);
    await expect(page).toHaveURL(/\/projects\/[^/]+$/, { timeout: 15_000 });

    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    const projectPath = new URL(page.url()).pathname;
    const slug = projectPath.split("/").pop();
    expect(slug).toBeTruthy();

    await page.goto(`/?q=${encodeURIComponent(projectTitle)}&license=${encodeURIComponent("CC BY 4.0")}`);
    await expect(page.getByRole("link", { name: projectTitle, exact: true })).toBeVisible();
    await expect(page.getByLabel("License")).toHaveValue("CC BY 4.0");
    await page.goto(`/?q=${encodeURIComponent(projectTitle)}&license=MIT`);
    await expect(page.getByText("No public projects match those filters.")).toBeVisible();
    await page.goto(`/?q=${encodeURIComponent("Real storage integration flow")}`);
    await expect(page.getByRole("link", { name: projectTitle, exact: true })).toBeVisible();
    await page.goto(projectPath);
    await page.getByText("Owner tools").click();

    await page.locator("form.revision-publish-form input[name=title]").fill("Initial revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Upload the first source and previews");
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
    const sourceLink = page.getByRole("list", { name: "Revision source files" }).getByRole("listitem").filter({ hasText: "source.zip" }).getByRole("link", { name: "Download" });
    await expect(sourceLink).toHaveAttribute("href", new RegExp(`/api/projects/${slug}/revisions/1/files/[^/]+$`));
    const sourceResponse = await page.request.get(await sourceLink.getAttribute("href") as string);
    expect(sourceResponse.status()).toBe(200);
    const originalBytes = await sourceResponse.body();
    expect(originalBytes.length).toBeGreaterThan(0);
    expect(originalBytes).toEqual(sourceBytes);

    await page.goto(`/projects/${slug}`);
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    await page.getByText("Owner tools").click();
    await page.locator("form.revision-publish-form input[name=title]").fill("Second revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Make a second revision before restoring the first");
    await page.locator('input[name="sourceUrl"]').fill("https://example.com/second-source.zip");
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
    await page.getByRole("button", { name: "Create contribution workspace" }).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/contribute\\?`));
    const returnedToContribution = new URL(page.url());
    expect(returnedToContribution.searchParams.get("baseRevision")).toBe("3");
    expect(returnedToContribution.searchParams.get("relatedIssue")).toBe(relatedIssueId);
    expect(returnedToContribution.searchParams.get("sourceRevision")).toBe("1");
    await expect(page.getByRole("status").filter({ hasText: "This fork is still an unchanged copy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to proposal" })).toBeDisabled();
    const workingProjectLink = page.getByRole("link", { name: "Open working project and publish a revision" });
    const workingProjectUrl = new URL(await workingProjectLink.getAttribute("href") as string, page.url());
    const forkPath = workingProjectUrl.pathname;
    const forkSlug = forkPath.split("/").at(-1)!;
    expect(workingProjectUrl.searchParams.get("contributionTarget")).toBe(slug);
    expect(workingProjectUrl.searchParams.get("baseRevision")).toBe("3");
    expect(workingProjectUrl.searchParams.get("relatedIssue")).toBe(relatedIssueId);
    await workingProjectLink.click();
    await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Prepare your working revision" })).toBeVisible();
    await expect(page.locator("#owner-tools")).toHaveAttribute("open", "");
    await page.locator("form.revision-publish-form input[name=title]").fill("Contribution revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Revise the forked source for a proposal");
    await page.locator('input[name="sources"]').setInputFiles({ name: "source-v2.zip", mimeType: "application/zip", buffer: Buffer.from("PK\\x03\\x04changed-integration-source") });
    await page.getByLabel("Unit identity").selectOption({ label: "source.zip - Existing source" });
    await page.locator('input[name="previews"]').setInputFiles({ name: "design-v2.png", mimeType: "image/png", buffer: tinyPng });
    await page.getByLabel("Alt text for design-v2.png").fill("Revised design preview");
    await page.getByRole("button", { name: "Publish revision" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/contribute\\?`));
    const returnedAfterPublish = new URL(page.url());
    expect(returnedAfterPublish.searchParams.get("baseRevision")).toBe("3");
    expect(returnedAfterPublish.searchParams.get("relatedIssue")).toBe(relatedIssueId);
    expect(returnedAfterPublish.searchParams.get("sourceProject")).toBe(forkSlug);
    expect(returnedAfterPublish.searchParams.get("sourceRevision")).toBe("2");
    await expect(page.getByLabel("Source revision")).toContainText(`${forkSlug} · r2 · Contribution revision`);
    await expect(page.getByRole("checkbox").first()).toBeVisible();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Continue to proposal" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${slug}/proposals/new\\?`));
    await expect(page.getByLabel("Related issue")).toHaveValue(relatedIssueId);
    await expect(page.locator(".proposal-form .file-input-row")).toHaveCount(1);

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
    await expect(page.getByRole("heading", { name: "알림" })).toBeVisible();
    const issueNotification = page.getByRole("listitem").filter({ hasText: issueTitle });
    const forkNotification = page.getByRole("listitem").filter({ hasText: "Fork했습니다." });
    await expect(issueNotification).toBeVisible();
    await expect(forkNotification).toBeVisible();
    await issueNotification.getByRole("button", { name: "읽음 처리" }).click();
    await expect(page.getByRole("link", { name: /Activity, 1 unread/ })).toBeVisible();
    await forkNotification.getByRole("button", { name: "읽음 처리" }).click();
    await expect(page.getByText("미확인 알림 0개")).toBeVisible();
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
});

async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "처음 오셨나요? 가입" }).click();
  await page.getByLabel("이름").fill(name);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
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
