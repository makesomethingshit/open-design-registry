import { expect, test, type Page } from "@playwright/test";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

test.describe("real PostgreSQL and S3 MVP flow", () => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL and S3-compatible services");

  test("uploads, publishes a revision, serves assets, and forks it", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = "integration-password-123";
    const projectTitle = `Integration project ${suffix}`;
    const forkTitle = `Integration fork ${suffix}`;

    await signUp(page, `Owner ${suffix}`, `owner-${suffix}@example.test`, password);
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
    const revisionUrl = page.url();
    await expect(page.getByRole("heading", { name: "Initial revision" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "HTML previews" })).toBeVisible();
    await expect(page.locator('iframe[title="HTML design preview"]')).toBeVisible();
    const sourceLink = page.getByRole("link", { name: "Download original file" });
    await expect(sourceLink).toHaveAttribute("href", /\/api\/assets\?key=/);
    const sourceResponse = await page.request.get(await sourceLink.getAttribute("href") as string);
    expect(sourceResponse.status()).toBe(200);
    expect((await sourceResponse.body()).length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
    await signUp(page, `Forker ${suffix}`, `forker-${suffix}@example.test`, password);
    await page.goto(revisionUrl);
    await expect(page.getByRole("heading", { name: "Fork this revision" })).toBeVisible();
    await page.getByLabel("Fork project title").fill(forkTitle);
    await page.locator('input[name="rightsConfirmed"]').check();
    await page.getByRole("button", { name: "Create fork" }).click();

    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(page.getByRole("heading", { name: forkTitle })).toBeVisible();
    await expect(page.getByText(new RegExp(`Forked from ${projectTitle}`))).toBeVisible();
  });
});

async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "처음 오셨나요? 가입" }).click();
  await page.getByLabel("이름").fill(name);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
}
