import { expect, test, type BrowserContext } from "@playwright/test";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
test.describe("collaborative design contributions", () => {
  test.skip(!process.env.E2E_INTEGRATION, "requires PostgreSQL and S3");
  test("proposes, requests changes, resubmits, accepts and preserves a private-fork snapshot", async ({ browser, baseURL }) => {
    test.setTimeout(180_000);
    const ownerContext = await browser.newContext({ baseURL });
    const authorContext = await browser.newContext({ baseURL });
    const anonymous = await browser.newContext({ baseURL });
    const suffix = crypto.randomUUID();
    try {
      for (const [context, name] of [[ownerContext, "Project owner"], [authorContext, "Design contributor"]] as const) {
        const response = await context.request.post("/api/auth/sign-up/email", { headers: { Origin: baseURL! }, data: { name, email: `${name.replaceAll(" ", "-")}-${suffix}@example.test`, password: "contribution-test-password-123" } });
        expect(response.ok()).toBe(true);
      }
      const projectResponse = await ownerContext.request.post("/api/projects", { multipart: { title: `Shared poster ${suffix}`, description: "A poster we build together", license: "MIT", isPublic: "true", rightsConfirmed: "true", cover: { name: "cover.png", mimeType: "image/png", buffer: png } } });
      expect(projectResponse.status()).toBe(201);
      const target = await projectResponse.json();
      const baseline = await publish(ownerContext, target.slug, "First poster");
      const forkResponse = await authorContext.request.post(`/api/projects/${target.slug}/revisions/${baseline.number}/fork`, { data: { rightsConfirmed: true, title: "My typography proposal" } });
      expect(forkResponse.status()).toBe(201);
      const fork = await forkResponse.json();
      const initialProposal = await publish(authorContext, fork.slug, "Clearer typography");
      const authorPage = await authorContext.newPage();
      const ownerPage = await ownerContext.newPage();
      await authorPage.goto(`/projects/${target.slug}/contributions`);
      const createForm = authorPage.getByRole("form", { name: "New contribution proposal" });
      await createForm.getByLabel("Proposal title").fill("Improve the poster typography");
      await createForm.getByLabel("What changed and why?").fill("Larger headings make the poster easier to scan.");
      await createForm.getByLabel("Your proposed revision").selectOption(initialProposal.id);
      await createForm.getByRole("checkbox").check();
      await createForm.getByRole("button", { name: "Submit proposal" }).click();
      await expect(authorPage).toHaveURL(/\/contributions\/[^/]+$/);
      const proposalPath = new URL(authorPage.url()).pathname;
      const proposalApi = `/api${proposalPath}`;
      await ownerPage.goto(proposalPath);
      await expect(ownerPage.getByRole("heading", { name: "Project baseline" })).toBeVisible();
      await expect(ownerPage.getByRole("heading", { name: "Proposed design" })).toBeVisible();
      const forbidden = await authorContext.request.patch(proposalApi, { data: { action: "accept", expectedVersion: 1, rightsConfirmed: true } });
      expect(forbidden.status()).toBe(403);
      const review = ownerPage.getByRole("form", { name: "Review proposal" });
      await review.getByLabel("Review explanation").fill("Increase contrast before we accept this.");
      await review.getByRole("button", { name: "Request changes" }).click();
      await expect(ownerPage.getByText("CHANGES REQUESTED", { exact: true })).toBeVisible();
      const revised = await publish(authorContext, fork.slug, "Higher contrast typography");
      const currentBase = await publish(ownerContext, target.slug, "Updated poster footer");
      await ownerPage.reload();
      await expect(ownerPage.getByRole("button", { name: "Accept proposal", exact: true })).toBeDisabled();
      await authorPage.reload();
      const update = authorPage.getByRole("form", { name: "Resubmit proposal" });
      await update.getByLabel("Updated revision").selectOption(revised.id);
      await update.getByLabel("Update explanation").fill("Increased contrast and compared with the latest footer.");
      await update.getByRole("checkbox").check();
      await update.getByRole("button", { name: "Resubmit proposal" }).click();
      await expect(authorPage.getByText("OPEN", { exact: true })).toBeVisible();
      // Publication consent preserves submitted snapshots under the target's visibility.
      expect((await authorContext.request.patch(`/api/projects/${fork.slug}`, { data: { isPublic: false } })).status()).toBe(200);
      const detail = await (await anonymous.request.get(proposalApi)).json();
      expect(detail.contribution.baseRevisionId).toBe(currentBase.id);
      expect(detail.contribution.proposedRevision.id).toBe(revised.id);
      expect((await anonymous.request.get(detail.contribution.proposedRevision.sourceUrl)).status()).toBe(200);
      expect((await anonymous.request.get(detail.contribution.proposedRevision.previews[0].url)).status()).toBe(200);
      // The superseded candidate remains an inspectable part of review history, too.
      expect((await anonymous.request.get(initialProposal.sourceUrl)).status()).toBe(200);
      await ownerPage.reload();
      const acceptForm = ownerPage.getByRole("form", { name: "Accept proposal" });
      await acceptForm.getByRole("checkbox").check();
      await acceptForm.getByRole("button", { name: "Accept proposal" }).click();
      await expect(ownerPage.getByText("ACCEPTED", { exact: true })).toBeVisible();
      const accepted = await (await ownerContext.request.get(proposalApi)).json();
      expect(accepted.contribution.acceptedRevision).toMatchObject({ number: 3, contributorName: "Design contributor", acceptedByName: "Project owner" });
      expect((await ownerContext.request.patch(proposalApi, { data: { action: "accept", expectedVersion: 3, rightsConfirmed: true } })).status()).toBe(200);
      const revisions = await (await ownerContext.request.get(`/api/projects/${target.slug}/revisions`)).json();
      expect(revisions).toHaveLength(3);
      expect(revisions[2]).toMatchObject({ parentId: currentBase.id, contributorName: "Design contributor", acceptedByName: "Project owner", sourceChecksum: revised.sourceChecksum });
      await ownerPage.getByRole("link", { name: "Revision 3", exact: true }).click();
      await expect(ownerPage.getByText(/Contributed by Design contributor · Accepted by Project owner/)).toBeVisible();
      await authorPage.goto("/notifications");
      await expect(authorPage.getByRole("link", { name: /기여 제안/ }).first()).toBeVisible();
      expect((await ownerContext.request.patch(`/api/projects/${target.slug}`, { data: { isPublic: false } })).status()).toBe(200);
      expect((await anonymous.request.get(proposalApi)).status()).toBe(404);
      expect((await anonymous.request.get(detail.contribution.proposedRevision.sourceUrl)).status()).toBe(404);
      const notifications = await (await authorContext.request.get("/api/notifications")).json();
      expect(notifications.notifications.filter((item: { contribution?: unknown }) => item.contribution)).toHaveLength(0);
    } finally { await ownerContext.close(); await authorContext.close(); await anonymous.close(); }
  });
});
async function publish(context: BrowserContext, slug: string, title: string) {
  const response = await context.request.post(`/api/projects/${slug}/revisions`, { multipart: { title, changeDescription: title,
    source: { name: "design.zip", mimeType: "application/zip", buffer: Buffer.from(`design-source:${title}`) },
    previews: { name: "preview.png", mimeType: "image/png", buffer: png }, altTexts: title,
  } });
  expect(response.status()).toBe(201);
  return response.json();
}
