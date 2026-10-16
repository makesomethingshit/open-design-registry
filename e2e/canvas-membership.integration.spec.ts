import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

test("Canvas applications stay private until first approval and retained history stays public", async ({ page, browser }, testInfo) => {
  test.skip(!process.env.E2E_INTEGRATION, "requires isolated PostgreSQL and S3-compatible test services");
  test.setTimeout(180_000);
  const suffix = randomUUID();
  const origin = testInfo.project.use.baseURL as string;
  const slug = `canvas-${suffix}`;
  const ownerEmail = `canvas-owner-${suffix}@example.test`;
  const applicantEmail = `canvas-applicant-${suffix}@example.test`;
  const prisma = new PrismaClient();
  let applicantContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let visitorContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;

  try {
    const ownerSignup = await page.request.post("/api/auth/sign-up/email", { headers: { origin }, data: { name: "Project owner", email: ownerEmail, password: "integration-password-123" } });
    expect(ownerSignup.ok()).toBe(true);
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail }, select: { id: true } });
    await prisma.project.create({ data: { slug, title: "Canvas membership fixture", description: "", license: "MIT", coverUrl: "", ownerId: owner.id, isPublic: true } });
    const base = `/projects/${slug}`;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/discussions#canvases`);
    const canvasArea = page.locator("#canvases");
    await expect(canvasArea.getByRole("heading", { name: "Canvases", exact: true })).toBeVisible();
    const createCanvas = canvasArea.getByRole("button", { name: "Create my Canvas", exact: true });
    await createCanvas.press("Enter");
    await expect(canvasArea.getByText("Approved", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Project sections" }).getByRole("link", { name: /^Discussions/ })).toHaveAttribute("aria-current", "page");

    applicantContext = await browser.newContext({ baseURL: origin });
    const applicant = await applicantContext.newPage();
    await applicant.setViewportSize({ width: 390, height: 844 });
    await applicant.goto(`${base}/discussions#canvases`);
    const signIn = applicant.getByRole("link", { name: "Sign in to apply", exact: true });
    const signInHref = await signIn.getAttribute("href");
    expect(signInHref).not.toBeNull();
    const signInUrl = new URL(signInHref!, origin);
    expect(signInUrl.searchParams.get("next")).toBe(`${base}/discussions#canvases`);
    await signIn.press("Enter");
    await applicant.getByRole("button", { name: "New here? Create an account", exact: true }).click();
    await applicant.getByRole("textbox", { name: "Name", exact: true }).fill("Canvas applicant");
    await applicant.getByRole("textbox", { name: "Email", exact: true }).fill(applicantEmail);
    await applicant.getByLabel("Password").fill("integration-password-123");
    await applicant.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(applicant).toHaveURL(new RegExp(`${base}/discussions#canvases$`));

    const applicantCanvases = applicant.locator("#canvases");
    const apply = applicantCanvases.getByRole("button", { name: "Apply for a Canvas", exact: true });
    await apply.press("Enter");
    await expect(applicantCanvases.getByText("Awaiting approval", { exact: false })).toBeVisible();
    await expect(applicantCanvases.getByText("This private application is visible only to its owner and this project's owner.", { exact: false })).toBeVisible();
    await applicantCanvases.getByRole("link", { name: "View your Canvas", exact: true }).press("Enter");
    await expect(applicant.getByRole("heading", { name: "Your Canvas", exact: true })).toBeVisible();
    await expect(applicant.getByText("Awaiting approval", { exact: false })).toBeVisible();
    await applicant.goto(`${base}/discussions#canvases`);
    for (const width of [390, 320]) {
      await applicant.setViewportSize({ width, height: 844 });
      await expect(applicantCanvases.getByRole("heading", { name: "Canvases", exact: true })).toBeVisible();
      expect(await applicant.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await applicant.screenshot({ path: testInfo.outputPath(`canvas-membership-${width}.png`), fullPage: true });
    }

    visitorContext = await browser.newContext({ baseURL: origin });
    const visitor = await visitorContext.newPage();
    await visitor.setViewportSize({ width: 320, height: 844 });
    await visitor.goto(`${base}/discussions#canvases`);
    const visitorCanvases = visitor.locator("#canvases");
    await expect(visitorCanvases.getByText("Canvas applicant's Canvas", { exact: true })).toHaveCount(0);
    await expect(visitorCanvases.getByText(/Awaiting approval|Application rejected|Private application/)).toHaveCount(0);
    const pendingList = await (await visitor.request.get(`/api${base}/canvases`)).json();
    expect(pendingList.some((canvas: { ownerName: string }) => canvas.ownerName === "Canvas applicant")).toBe(false);

    await page.goto(`${base}/discussions#canvases`);
    const ownerCanvasArea = page.locator("#canvases");
    const privateRow = ownerCanvasArea.getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" });
    await expect(privateRow).toContainText("Awaiting approval");
    await expect(privateRow.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    await privateRow.getByRole("button", { name: "Reject", exact: true }).press("Enter");
    await expect(privateRow).toContainText("Application rejected");
    await expect(privateRow).toContainText("private application");
    await applicant.reload();
    await expect(applicant.locator("#canvases").getByRole("listitem").filter({ hasText: "Your Canvas" })).toContainText("Application rejected");
    await expect(visitorCanvases.getByText("Canvas applicant's Canvas", { exact: true })).toHaveCount(0);

    const rejected = await (await applicant.request.get(`/api${base}/canvases`)).json();
    const privateCanvas = rejected.find((canvas: { ownerName: string }) => canvas.ownerName === "Canvas applicant");
    expect(privateCanvas).toMatchObject({ accessStatus: "REJECTED", firstApprovedAt: null, canReapply: true });
    expect(privateCanvas).not.toHaveProperty("ownerId");
    expect(privateCanvas).not.toHaveProperty("email");

    await applicant.locator("#canvases").getByRole("button", { name: "Reapply", exact: true }).press("Enter");
    await expect(applicant.locator("#canvases").getByRole("listitem").filter({ hasText: "Your Canvas" })).toContainText("Awaiting approval");
    await page.goto(`${base}/discussions#canvases`);
    const reapplication = page.locator("#canvases").getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" });
    await reapplication.getByRole("button", { name: "Approve", exact: true }).press("Enter");
    await expect(reapplication).toContainText("Approved");

    await applicant.goto(`${base}/discussions#canvases`);
    const ownCanvas = applicant.locator("#canvases").getByRole("listitem").filter({ hasText: "Your Canvas" });
    await ownCanvas.getByRole("button", { name: "Withdraw access", exact: true }).press("Enter");
    await expect(ownCanvas).toContainText("Access revoked");
    await expect(ownCanvas.getByRole("button", { name: "Reapply", exact: true })).toBeVisible();

    await visitor.goto(`${base}/discussions#canvases`);
    const historyRow = visitor.locator("#canvases").getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" });
    await expect(historyRow).toContainText("Read-only public history");
    await expect(historyRow).toContainText("first approved");
    await expect(historyRow.getByRole("button", { name: "Reapply", exact: true })).toHaveCount(0);
    const publicHistory = (await (await visitor.request.get(`/api${base}/canvases`)).json()).find((canvas: { ownerName: string }) => canvas.ownerName === "Canvas applicant");
    expect(publicHistory).toMatchObject({ accessStatus: "REVOKED", firstApprovedAt: expect.any(String), canEdit: false, canComment: false });
    for (const privateField of ["ownerId", "approvedById", "projectOwnerId", "email"]) expect(publicHistory).not.toHaveProperty(privateField);

    await applicant.locator("#canvases").getByRole("button", { name: "Reapply", exact: true }).press("Enter");
    await expect(applicant.locator("#canvases").getByRole("listitem").filter({ hasText: "Your Canvas" })).toContainText("Reapplication pending");
    await page.goto(`${base}/discussions#canvases`);
    const pendingHistory = page.locator("#canvases").getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" });
    await expect(pendingHistory).toContainText("Reapplication pending");
    await pendingHistory.getByRole("button", { name: "Reject", exact: true }).press("Enter");
    await expect(pendingHistory).toContainText("Reapplication rejected");
    await visitor.reload();
    await expect(visitor.locator("#canvases").getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" })).toContainText("Read-only public history");
    await expect(visitor.locator("#canvases").getByText(/Reapplication pending|Reapplication rejected/)).toHaveCount(0);

    await applicant.reload();
    await expect(applicant.locator("#canvases").getByRole("listitem").filter({ hasText: "Your Canvas" })).toContainText("Reapplication rejected");
    await applicant.locator("#canvases").getByRole("button", { name: "Reapply", exact: true }).press("Enter");
    await page.goto(`${base}/discussions#canvases`);
    const retryRow = page.locator("#canvases").getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" });
    await retryRow.getByRole("button", { name: "Approve", exact: true }).press("Enter");
    await expect(retryRow).toContainText("Approved");
    await retryRow.getByRole("button", { name: "Revoke access", exact: true }).press("Enter");
    await expect(retryRow).toContainText("Access revoked");
    await visitor.reload();
    await expect(visitor.locator("#canvases").getByRole("listitem").filter({ hasText: "Canvas applicant's Canvas" })).toContainText("Read-only public history");
    for (const width of [390, 320]) {
      await visitor.setViewportSize({ width, height: 844 });
      expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  } finally {
    await visitorContext?.close();
    await applicantContext?.close();
    await prisma.project.deleteMany({ where: { slug } });
    await prisma.user.deleteMany({ where: { email: { in: [ownerEmail, applicantEmail] } } });
    await prisma.$disconnect();
  }
});
