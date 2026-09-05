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

    await signUp(page, `Owner ${suffix}`, ownerEmail, password);
    await page.goto("/projects/new");
    await page.getByLabel("제목").fill(projectTitle);
    await page.getByLabel("설명").fill("Real storage integration flow");
    await page.locator('input[name="cover"]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: tinyPng });
    await page.locator('input[name="rightsConfirmed"]').check();
    await page.getByRole("button", { name: "생성하기" }).click();

    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    const projectPath = new URL(page.url()).pathname;
    const slug = projectPath.split("/").pop();
    expect(slug).toBeTruthy();

    await page.goto(`/?q=${encodeURIComponent(projectTitle)}&license=${encodeURIComponent("CC BY 4.0")}`);
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    await expect(page.getByLabel("License")).toHaveValue("CC BY 4.0");
    await page.goto(`/?q=${encodeURIComponent(projectTitle)}&license=MIT`);
    await expect(page.getByText("No public projects match those filters.")).toBeVisible();
    await page.goto(`/?q=${encodeURIComponent("Real storage integration flow")}`);
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
    await page.goto(projectPath);

    await page.locator("form.revision-publish-form input[name=title]").fill("Initial revision");
    await page.locator("form.revision-publish-form textarea[name=changeDescription]").fill("Upload the first source and previews");
    await page.locator('input[name="source"]').setInputFiles({ name: "source.zip", mimeType: "application/zip", buffer: Buffer.from("PK\\x03\\x04integration-source") });
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
    const sourceLink = page.getByRole("link", { name: "Download original file" });
    await expect(sourceLink).toHaveAttribute("href", /\/api\/assets\?key=/);
    const sourceResponse = await page.request.get(await sourceLink.getAttribute("href") as string);
    expect(sourceResponse.status()).toBe(200);
    expect((await sourceResponse.body()).length).toBeGreaterThan(0);

    await page.goto(`/projects/${slug}`);
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible();
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
    await page.goto(restoredRevisionUrl);
    await expect(page.getByRole("heading", { name: "Fork this revision" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore as new revision" })).toHaveCount(0);
    await page.getByLabel("Fork project title").fill(forkTitle);
    await page.locator('input[name="rightsConfirmed"]').check();
    await page.getByRole("button", { name: "Create fork" }).click();

    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();
    await expect(page.getByText(new RegExp(`Forked from ${projectTitle}`))).toBeVisible();
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
