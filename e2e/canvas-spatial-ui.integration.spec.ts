import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Canvas spatial detail page in a real browser", () => {
  test.skip(!process.env.E2E_INTEGRATION, "requires the disposable PostgreSQL-backed integration app");
  test.setTimeout(120_000);
  test.afterAll(() => prisma.$disconnect());

  test("persists move, resize and stack actions; keeps feedback with archived history on desktop and mobile", async ({ page, browser }) => {
    const suffix = crypto.randomUUID();
    const ownerContext = await browser.newContext({ baseURL });
    const owner = await ownerContext.newPage();
    let projectId: string | undefined;
    let ownerId: string | undefined;
    let authorId: string | undefined;
    let canvasId: string | undefined;

    try {
      await signUp(page, `Canvas author ${suffix}`, `canvas-author-${suffix}@example.test`);
      await signUp(owner, `Canvas reviewer ${suffix}`, `canvas-reviewer-${suffix}@example.test`);
      const authorSession = await page.request.get("/api/auth/get-session");
      const ownerSession = await owner.request.get("/api/auth/get-session");
      authorId = (await authorSession.json()).user.id as string;
      ownerId = (await ownerSession.json()).user.id as string;

      const slug = `canvas-spatial-${suffix}`;
      projectId = (await prisma.project.create({ data: {
        slug, ownerId, title: "Spatial Canvas browser test", description: "", license: "MIT", coverUrl: "", isPublic: true,
        publicationConfirmedAt: new Date(), publicationConfirmedBy: ownerId,
      } })).id;
      const application = await page.request.post(`/api/projects/${slug}/canvases`);
      expect(application.status()).toBe(200);
      canvasId = (await application.json()).id as string;
      expect((await owner.request.patch(`/api/projects/${slug}/canvases/${canvasId}`, { data: { action: "approve" } })).status()).toBe(200);

      const [moveItem, resizeItem, archiveItem] = await Promise.all([
        prisma.canvasItem.create({ data: { canvasId, authorId, kind: "TEXT", origin: "REFERENCE", body: "Move target", sourceUrl: "https://example.org/reference", rightsNote: "Used with permission", x: 40, y: 45, width: 240, height: 180, zIndex: 0 } }),
        prisma.canvasItem.create({ data: { canvasId, authorId, kind: "TEXT", origin: "ORIGINAL", body: "Resize target", x: 360, y: 75, width: 220, height: 170, zIndex: 1 } }),
        prisma.canvasItem.create({ data: { canvasId, authorId, kind: "TEXT", origin: "ORIGINAL", body: "Archive target", x: 680, y: 105, width: 220, height: 170, zIndex: 2 } }),
      ]);
      const detailPath = `/projects/${slug}/canvases/${canvasId}`;
      await page.goto(detailPath);
      const board = page.getByRole("region", { name: "Canvas board" });
      await expect(board.getByRole("region", { name: /Spatial Canvas/ })).toBeVisible();
      await expect(board.getByLabel("Select an item").locator("option")).toHaveCount(4);
      await expect(board.getByText("Used with permission", { exact: true })).toBeVisible();

      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await board.getByRole("button", { name: "Fit", exact: true }).click();
      const moveHandle = board.locator(`[data-item-id="${moveItem.id}"] [data-drag-handle]`);
      await dragBy(page, moveHandle, 72, 48);
      await expect.poll(async () => {
        const row = await prisma.canvasItem.findUnique({ where: { id: moveItem.id }, select: { x: true, y: true } });
        return row ? [row.x, row.y] : null;
      }).not.toEqual([40, 45]);
      const moved = await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } });

      const resizeHandle = board.locator(`[data-item-id="${moveItem.id}"] [data-resize-handle]`);
      await dragBy(page, resizeHandle, 52, 38);
      await expect.poll(async () => (await prisma.canvasItem.findUnique({ where: { id: moveItem.id }, select: { width: true } }))?.width ?? 0).toBeGreaterThan(240);
      const resized = await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } });

      await page.reload();
      const reentered = board.locator(`[data-item-id="${moveItem.id}"]`);
      await expect(reentered).toHaveCSS("left", `${moved.x}px`);
      await expect(reentered).toHaveCSS("top", `${moved.y}px`);
      await expect(reentered).toHaveCSS("width", `${resized.width}px`);
      await expect(reentered).toHaveCSS("height", `${resized.height}px`);

      await reentered.focus();
      const keyboardMove = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await reentered.press("Alt+ArrowRight");
      expect((await keyboardMove).status()).toBe(200);
      await expect.poll(async () => (await prisma.canvasItem.findUnique({ where: { id: moveItem.id }, select: { x: true } }))?.x ?? 0).toBeCloseTo(moved.x + 10, 4);

      await board.getByLabel("Select an item").selectOption(resizeItem.id);
      await board.getByLabel("Width").fill("340");
      const numericSave = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await board.getByRole("button", { name: "Save layout", exact: true }).click();
      expect((await numericSave).status()).toBe(200);
      expect(await prisma.canvasItem.findUnique({ where: { id: resizeItem.id }, select: { width: true } })).toMatchObject({ width: 340 });

      await board.getByLabel("Select an item").selectOption(moveItem.id);
      const versionBeforeStack = (await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId }, select: { layoutVersion: true } })).layoutVersion;
      let stackPatchCount = 0;
      const countStackPatch = (request: import("@playwright/test").Request) => {
        if (request.method() === "PATCH" && new URL(request.url()).pathname.endsWith("/layout")) stackPatchCount += 1;
      };
      page.on("request", countStackPatch);
      const stackResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await board.getByRole("button", { name: "Bring to front", exact: true }).click();
      const stackResponse = await stackResponsePromise;
      const stackResult = await stackResponse.json() as { items: Array<{ id: string; zIndex: number; author: { name: string } | null }>; layoutVersion: number };
      page.off("request", countStackPatch);
      expect(stackResponse.status()).toBe(200);
      expect(stackPatchCount).toBe(1);
      expect(stackResult.layoutVersion).toBe(versionBeforeStack + 1);
      expect(stackResult.items.find((item) => item.id === moveItem.id)).toMatchObject({ zIndex: 2, author: { name: `Canvas author ${suffix}` } });

      await page.reload();
      await expect(board.locator(`[data-item-id="${moveItem.id}"]`)).toHaveCSS("z-index", "2");
      const viewport = board.getByRole("region", { name: /Spatial Canvas/ });
      const world = page.locator("[data-testid='canvas-world']");
      const worldBeforePan = await world.getAttribute("style");
      await viewport.focus();
      await viewport.press("ArrowRight");
      expect(await world.getAttribute("style")).not.toBe(worldBeforePan);
      const zoomBefore = await board.getByLabel("Zoom level").textContent();
      await board.getByRole("button", { name: "Zoom in" }).click();
      expect(await board.getByLabel("Zoom level").textContent()).not.toBe(zoomBefore);
      await board.getByRole("button", { name: "Reset", exact: true }).click();

      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const dimensions = await page.evaluate(() => ({
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          boardWidth: document.querySelector<HTMLElement>("[aria-label='Canvas board']")?.getBoundingClientRect().width ?? 0,
        }));
        expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
        expect(dimensions.boardWidth).toBeLessThanOrEqual(width);
        await expect(board.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
        await viewport.focus();
        const beforeMobilePan = await world.getAttribute("style");
        await viewport.press("ArrowDown");
        expect(await world.getAttribute("style")).not.toBe(beforeMobilePan);
      }

      await owner.goto(detailPath);
      const ownerBoard = owner.getByRole("region", { name: "Canvas board" });
      await expect(ownerBoard.getByRole("region", { name: /Spatial Canvas/ })).toBeVisible();
      await expect(ownerBoard.getByLabel("Select an item").locator("option")).toHaveCount(4);
      await ownerBoard.getByLabel("Select an item").selectOption(moveItem.id);
      await ownerBoard.getByRole("textbox", { name: "Add feedback", exact: true }).fill("Keep this with the moved note");
      await ownerBoard.getByRole("button", { name: "Post feedback", exact: true }).click();
      await expect(ownerBoard.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await ownerBoard.getByLabel("Select an item").selectOption(resizeItem.id);
      await expect(ownerBoard.getByText("Keep this with the moved note", { exact: true })).toHaveCount(0);
      await ownerBoard.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(ownerBoard.getByText("Keep this with the moved note", { exact: true })).toBeVisible();

      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(board.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await board.getByRole("button", { name: "Archive selected item", exact: true }).click();
      await expect(board.getByText("Archived item · comments stay with this item", { exact: true })).toBeVisible();
      await expect(board.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await expect(board.getByRole("button", { name: "Post feedback", exact: true })).toHaveCount(0);
      await expect(board.locator(`[data-item-id="${moveItem.id}"] [data-drag-handle]`)).toHaveCount(0);

      expect((await owner.request.patch(`/api/projects/${slug}/canvases/${canvasId}`, { data: { action: "revoke" } })).status()).toBe(200);
      await page.reload();
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(board.getByText(/read-only/i).first()).toBeVisible();
      await expect(board.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await expect(board.getByRole("button", { name: "Post feedback", exact: true })).toHaveCount(0);
      await expect(board.locator("[data-drag-handle]")).toHaveCount(0);
    } finally {
      if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
      if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
      if (authorId) await prisma.user.deleteMany({ where: { id: authorId } });
      await ownerContext.close();
    }
  });
});

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "New here? Create an account", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel("Password").fill("canvas-spatial-browser-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Account/ })).toBeVisible();
}

async function dragBy(page: Page, handle: import("@playwright/test").Locator, dx: number, dy: number) {
  const box = await handle.boundingBox();
  if (!box) throw new Error("Canvas drag handle is not visible");
  const x = box.x + Math.min(box.width / 2, 20);
  const y = box.y + Math.min(box.height / 2, 16);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}
