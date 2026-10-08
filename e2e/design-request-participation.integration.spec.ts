import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined);

test.describe("Design Request participation", () => {
  test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL authentication");
  test.setTimeout(90_000);

  test.afterAll(() => prisma.$disconnect());

  test("supports anonymous viewing, two participants, keyboard toggle, and close cleanup on desktop and mobile", async ({ page, browser }, testInfo) => {
    const suffix = crypto.randomUUID();
    const email = `participation-browser-${suffix}@example.test`;
    const participantEmail = `participation-browser-other-${suffix}@example.test`;
    const password = "participation-browser-password-123";
    await signUp(page, `Browser owner ${suffix}`, email, password);
    const session = await page.request.get("/api/auth/get-session");
    expect(session.status()).toBe(200);
    const user = (await session.json()).user as { id: string };
    const project = await prisma.project.create({ data: { slug: `participation-browser-${suffix}`, title: "Browser participation project", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: user.id } });
    const issue = await prisma.issue.create({ data: { projectId: project.id, authorId: user.id, title: "A mobile design request", body: "Try a clearer mobile path", kind: "DESIGN_REQUEST" } });
    const issuePath = `/projects/${project.slug}/issues/${issue.id}`;
    let participantId: string | undefined;

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(issuePath);
      await expect(page.getByRole("heading", { name: "Working interest", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("desktop-owner.png"), fullPage: true });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Working interest", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Working on this", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Working on this", exact: true }).press("Enter");
      await expect(page.getByRole("button", { name: "Stop working on this", exact: true })).toBeVisible();
      await expect(page.getByText(/1 person is working on this: Browser owner/)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("mobile-owner.png"), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      const visitorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
      try {
        const visitor = await visitorContext.newPage();
        await visitor.goto(issuePath);
        await expect(visitor.getByText(/1 person is working on this: Browser owner/)).toBeVisible();
        await expect(visitor.getByText("Sign in to say you’re working on this.")).toBeVisible();
        await expect(visitor.getByRole("link", { name: "Sign in to participate", exact: true })).toHaveAttribute("href", `/login?next=${encodeURIComponent(issuePath)}`);
        await expect(visitor.getByText(email, { exact: false })).toHaveCount(0);
        await visitor.screenshot({ path: testInfo.outputPath("mobile-anonymous.png"), fullPage: true });
      } finally {
        await visitorContext.close();
      }

      const participantContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
      try {
        const participant = await participantContext.newPage();
        await participant.setViewportSize({ width: 390, height: 844 });
        await signUp(participant, `Browser participant ${suffix}`, participantEmail, password);
        const participantSession = await participant.request.get("/api/auth/get-session");
        participantId = ((await participantSession.json()).user as { id: string }).id;
        await participant.goto(issuePath);
        await expect(participant.getByRole("button", { name: "Working on this", exact: true })).toBeVisible();
        await participant.getByRole("button", { name: "Working on this", exact: true }).click();
        await expect(participant.getByText(/2 people are working on this: Browser owner/)).toBeVisible();
        await expect(participant.getByRole("button", { name: "Stop working on this", exact: true })).toBeVisible();
        await participant.screenshot({ path: testInfo.outputPath("mobile-third-party.png"), fullPage: true });
      } finally {
        await participantContext.close();
      }

      await page.reload();
      await expect(page.getByText(/2 people are working on this: Browser owner/)).toBeVisible();
      await page.getByRole("button", { name: "Stop working on this", exact: true }).press("Enter");
      await expect(page.getByRole("button", { name: "Working on this", exact: true })).toBeVisible();
      await expect(page.getByText(/1 person is working on this: Browser participant/)).toBeVisible();

      await page.getByRole("button", { name: "Close issue", exact: true }).press("Enter");
      await expect(page.getByRole("button", { name: "Reopen issue", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Working interest", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Reopen issue", exact: true }).press("Enter");
      await expect(page.getByRole("button", { name: "Working on this", exact: true })).toBeVisible();
      await expect(page.getByText("No one is working on this yet.")).toBeVisible();
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      if (participantId) await prisma.user.delete({ where: { id: participantId } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

async function signUp(page: Page, name: string, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Account/ })).toBeVisible();
}
