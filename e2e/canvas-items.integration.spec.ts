import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { assetKeyFromStoredUrl, deleteObject } from "../src/lib/storage";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
test.skip(!process.env.E2E_INTEGRATION, "requires local PostgreSQL and the dedicated S3-compatible test bucket");

test("adds Canvas notes and images and safely completes a replacement when archive transport fails", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const origin = (testInfo.project.use.baseURL as string | undefined) ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  const ownerEmail = `canvas-items-${Date.now()}@example.test`;
  let projectId: string | undefined;
  let canvasId: string | undefined;
  try {
  const signed = await page.request.post("/api/auth/sign-up/email", {
    headers: { origin },
    data: { name: "Canvas owner", email: ownerEmail, password: "integration-password-123" },
  });
  expect(signed.ok()).toBe(true);
  const created = await page.request.post("/api/projects", { multipart: {
    title: "Canvas item UI fixture", description: "A public project for Canvas item browser coverage", license: "MIT", isPublic: "true", rightsConfirmed: "on",
    cover: { name: "cover.png", mimeType: "image/png", buffer: image },
  } });
  expect(created.status()).toBe(201);
  const { slug, id: createdProjectId } = await created.json();
  projectId = createdProjectId;
  const application = await page.request.post(`/api/projects/${slug}/canvases`);
  expect(application.ok()).toBe(true);
  const canvas = await application.json();
  canvasId = canvas.id;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${slug}/canvases/${canvas.id}`);
  const panel = page.getByRole("region", { name: "Canvas items" });
  await expect(panel.getByRole("heading", { name: "Canvas items" })).toBeVisible();

  let createCount = 0;
  let archiveCount = 0;
  let releaseArchive!: () => void;
  let archiveStarted!: () => void;
  const archiveGate = new Promise<void>((resolve) => { releaseArchive = resolve; });
  const archiveRequest = new Promise<void>((resolve) => { archiveStarted = resolve; });
  await page.route(`**/api/projects/${slug}/canvases/${canvas.id}/items`, async (route) => {
    if (route.request().method() === "POST") createCount++;
    await route.continue();
  });
  await page.route(`**/api/projects/${slug}/canvases/${canvas.id}/items/*`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    archiveCount++;
    if (archiveCount === 1) {
      archiveStarted();
      await archiveGate;
      return route.abort("failed");
    }
    await route.continue();
  });

  await panel.getByLabel("Note", { exact: true }).fill("Original board note");
  await panel.getByLabel("Source URL (optional)").fill("https://example.test/original");
  await panel.getByLabel("Rights note (optional)").fill("Used with permission for this concept");
  await panel.getByRole("button", { name: "Add item", exact: true }).focus();
  await page.keyboard.press("Enter");
  const original = panel.getByRole("article", { name: "Note" }).filter({ hasText: "Original board note" });
  await expect(original).toContainText("Original work");
  await expect(original).toContainText("Canvas owner");
  await expect(original.getByRole("link", { name: "https://example.test/original" })).toBeVisible();
  await expect(original).toContainText("Used with permission for this concept");

  await original.getByRole("button", { name: "Replace with a new item" }).focus();
  await page.keyboard.press("Enter");
  await panel.getByLabel("Note", { exact: true }).fill("Replacement board note");
  await panel.getByRole("button", { name: "Save replacement" }).focus();
  await page.keyboard.press("Enter");
  await archiveRequest;
  await expect(panel.getByRole("status")).toContainText("archiving the previous item");
  releaseArchive();
  await expect(panel.getByRole("status")).toContainText("Both items remain visible");
  await expect(panel.getByRole("heading", { name: "Add to this Canvas" })).toBeVisible();
  await expect(original).toContainText("Canvas owner");
  await expect(panel.getByText("Replacement board note", { exact: true })).toBeVisible();
  expect(createCount).toBe(2);
  expect(archiveCount).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // The old item is independently archivable; its identity and attribution survive the response.
  await original.getByRole("button", { name: "Archive", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(original).toHaveAttribute("data-archived", "true");
  await expect(original).toContainText("Canvas owner");
  expect(createCount).toBe(2);
  expect(archiveCount).toBe(2);

  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Item type").selectOption("IMAGE");
  await page.getByLabel("Contribution type").selectOption("REFERENCE");
  await page.getByLabel("Image file").setInputFiles({ name: "reference.png", mimeType: "image/png", buffer: image });
  await page.getByLabel("Alternative text").fill("One pixel reference image");
  await page.getByLabel("Source URL (optional)").fill("https://example.test/reference");
  await page.getByLabel("Rights note (optional)").fill("Reference only; no reuse rights implied");
  await page.getByRole("button", { name: "Add item", exact: true }).focus();
  await page.keyboard.press("Enter");
  const rendered = page.getByRole("img", { name: "One pixel reference image" });
  const reference = page.getByRole("article", { name: "Image" }).filter({ has: rendered });
  await expect(rendered).toBeVisible();
  await expect.poll(() => rendered.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(reference).toContainText("Reference material");
  await expect(reference).toContainText("Reference only; no reuse rights implied");
  await expect(reference.getByRole("link", { name: "https://example.test/reference" })).toBeVisible();
  await expect(reference.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  } finally {
    const [project, items] = await Promise.all([
      projectId ? prisma.project.findUnique({ where: { id: projectId }, select: { coverUrl: true } }) : null,
      canvasId ? prisma.canvasItem.findMany({ where: { canvasId }, select: { assetKey: true } }) : [],
    ]);
    const keys = new Set([assetKeyFromStoredUrl(project?.coverUrl), ...items.map((item) => item.assetKey)].filter((key): key is string => Boolean(key)));
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { email: ownerEmail } });
    await Promise.all([...keys].map((key) => deleteObject(key)));
    await prisma.$disconnect();
  }
});
