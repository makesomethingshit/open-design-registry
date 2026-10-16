import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Canvas spatial detail page in a real browser", () => {
  test.skip(!process.env.E2E_INTEGRATION, "requires the disposable PostgreSQL-backed integration app");
  test.setTimeout(120_000);
  test.afterAll(() => prisma.$disconnect());

  test("persists move, resize and stack actions; keeps feedback with archived history on desktop and mobile", async ({ page, browser }, testInfo) => {
    const suffix = crypto.randomUUID();
    const ownerContext = await browser.newContext({ baseURL });
    const owner = await ownerContext.newPage();
    const duplicateKeyWarnings: string[] = [];
    const collectDuplicateKeyWarnings = (target: Page) => target.on("console", (message) => {
      if (message.text().toLowerCase().includes("same key")) duplicateKeyWarnings.push(message.text());
    });
    collectDuplicateKeyWarnings(page);
    collectDuplicateKeyWarnings(owner);
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
        prisma.canvasItem.create({ data: { canvasId, authorId, kind: "TEXT", origin: "ORIGINAL", body: "Resize target " + "Long scrollable note. ".repeat(80), x: 360, y: 75, width: 220, height: 170, zIndex: 1 } }),
        prisma.canvasItem.create({ data: { canvasId, authorId, kind: "TEXT", origin: "ORIGINAL", body: "Archive target", x: 3_000, y: 1_800, width: 220, height: 170, zIndex: 2 } }),
      ]);
      const detailPath = `/projects/${slug}/canvases/${canvasId}`;
      let releaseInitial!: () => void, initialReady!: () => void;
      const initialGate = new Promise<void>((resolve) => { releaseInitial = resolve; });
      const initialCaptured = new Promise<void>((resolve) => { initialReady = resolve; });
      const initialItemsPattern = `**/canvases/${canvasId}/items`;
      await page.route(initialItemsPattern, async (route) => {
        const response = await route.fetch();
        initialReady(); await initialGate;
        await route.fulfill({ response });
      });
      await page.goto(detailPath);
      const board = page.getByRole("region", { name: "Canvas board" });
      await initialCaptured;
      const panViewport = board.getByTestId("canvas-viewport");
      const panBox = await panViewport.boundingBox();
      if (!panBox) throw new Error("Missing pan viewport");
      await page.mouse.move(panBox.x + 10, panBox.y + 10);
      await page.mouse.down();
      await page.mouse.move(panBox.x + 45, panBox.y + 30);
      await page.mouse.up();
      releaseInitial();
      await expect(board.locator("[data-item-id]")).toHaveCount(3);
      await page.unroute(initialItemsPattern);
      await expect(board.getByRole("region", { name: /Spatial Canvas/ })).toBeVisible();
      await expect(board.getByLabel("Select an item").locator("option")).toHaveCount(4);
      await expect(board.getByText("Used with permission", { exact: true })).toBeVisible();

      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await board.getByRole("button", { name: "Fit", exact: true }).click();
      const moveHandle = board.locator(`[data-item-id="${moveItem.id}"] [data-drag-handle]`);
      const beforeClick = await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId } });
      let unchangedWrites = 0;
      const countUnchanged = (request: import("@playwright/test").Request) => {
        if (new URL(request.url()).pathname.endsWith("/layout") && request.method() === "PATCH") unchangedWrites++;
      };
      page.on("request", countUnchanged);
      await moveHandle.click();
      await board.getByLabel("X position", { exact: true }).fill("040");
      await board.getByRole("button", { name: "Save layout", exact: true }).click();
      await immediateDrag(page, board.locator(`[data-item-id="${moveItem.id}"] [data-resize-handle]`), 0, 0);
      await board.getByRole("button", { name: "Fit", exact: true }).click();
      await expect.poll(async () => (await prisma.projectCanvas.findUniqueOrThrow({ where: { id: canvasId } })).layoutVersion).toBe(beforeClick.layoutVersion);
      expect(unchangedWrites).toBe(0);
      page.off("request", countUnchanged);
      expect((await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } })).updatedAt).toEqual(moveItem.updatedAt);
      const moveSave = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      const moveZoom = await board.locator("[data-testid=canvas-world]").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      await immediateDrag(page, moveHandle, 72, 48);
      expect((await moveSave).status()).toBe(200);
      await expect(board.getByRole("button", { name: "Save layout", exact: true })).toBeEnabled();
      await expect.poll(async () => {
        const row = await prisma.canvasItem.findUnique({ where: { id: moveItem.id }, select: { x: true, y: true } });
        return row ? [row.x, row.y] : null;
      }).not.toEqual([40, 45]);
      const moved = await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } });
      expect(moved.x).toBeCloseTo(moveItem.x + 72 / moveZoom, 2);
      expect(moved.y).toBeCloseTo(moveItem.y + 48 / moveZoom, 2);

      const resizeHandle = board.locator(`[data-item-id="${moveItem.id}"] [data-resize-handle]`);
      const resizeSave = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await immediateDrag(page, resizeHandle, 52, 38);
      expect((await resizeSave).status()).toBe(200);
      await expect(board.getByRole("button", { name: "Save layout", exact: true })).toBeEnabled();
      await expect.poll(async () => (await prisma.canvasItem.findUnique({ where: { id: moveItem.id }, select: { width: true } }))?.width ?? 0).toBeGreaterThan(240);
      const resized = await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } });
      expect(resized.width).toBeCloseTo(moved.width + 52 / moveZoom, 2);
      expect(resized.height).toBeCloseTo(moved.height + 38 / moveZoom, 2);

      await page.reload();
      const reentered = board.locator(`[data-item-id="${moveItem.id}"]`);
      const persistedGeometry = [moved.x, moved.y, resized.width, resized.height];
      await expect.poll(async () => reentered.evaluate((element, expected) => {
        const style = getComputedStyle(element);
        const actual = [style.left, style.top, style.width, style.height].map((value) => Number.parseFloat(value));
        return actual.every((value, index) => Math.abs(value - expected[index]) < 0.01);
      }, persistedGeometry)).toBe(true);

      // A committed archive with a damaged response must refresh both panels.
      for (const failure of ["json", "network"]) {
        const lostItem = await prisma.canvasItem.create({ data: { canvasId, authorId, kind: "TEXT", origin: "ORIGINAL", body: "Lost archive response", x: 0, y: 0 } });
        await page.reload();
        await board.getByLabel("Select an item").selectOption(lostItem.id);
        const lostUrl = `**/items/${lostItem.id}`;
        await page.route(lostUrl, async (route) => {
          await route.fetch();
          if (failure === "network") await route.abort("failed");
          else await route.fulfill({ status: 200, contentType: "application/json", body: "{" });
        });
        await board.getByRole("button", { name: "Archive selected item", exact: true }).click();
        await expect(board.getByText("Archived item · comments stay with this item", { exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Canvas items", exact: true }).locator("article[data-archived=true]").filter({ hasText: "Lost archive response" })).toHaveCount(1);
        await page.unroute(lostUrl);
        await prisma.canvasItem.delete({ where: { id: lostItem.id } });
      }

      await prisma.canvasItemComment.createMany({ data: Array.from({ length: 105 }, (_, index) => ({ id: `${moveItem.id}-paged-${String(index).padStart(3, "0")}`, itemId: moveItem.id, body: `Paged feedback ${index}`, createdAt: new Date("2026-01-01") })) });
      await page.reload();
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      const feedbackList = board.getByRole("list", { name: `Feedback for item ${moveItem.id}` });
      await expect(feedbackList.locator("li")).toHaveCount(50);
      await board.getByRole("textbox", { name: "Add feedback", exact: true }).fill("Newest paged feedback");
      await board.getByRole("button", { name: "Post feedback", exact: true }).click();
      await expect(board.getByRole("status").filter({ hasText: "Feedback saved." })).toBeVisible();
      await expect(feedbackList.locator("li")).toHaveCount(50);
      await expect(feedbackList).not.toContainText("Newest paged feedback");
      await board.getByRole("button", { name: "Load more feedback", exact: true }).click();
      await expect(feedbackList.locator("li")).toHaveCount(100);
      await board.getByRole("button", { name: "Load more feedback", exact: true }).click();
      await expect(feedbackList.locator("li")).toHaveCount(106);
      const expectedComments = await prisma.canvasItemComment.findMany({ where: { itemId: moveItem.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      expect(await feedbackList.locator("li p").allTextContents()).toEqual(expectedComments.map((entry) => entry.body));
      expect(new Set(await feedbackList.locator("li p").allTextContents()).size).toBe(106);

      // A delayed next page must not overwrite a newer selection of the same item.
      await board.getByLabel("Select an item").selectOption(resizeItem.id);
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(feedbackList.locator("li")).toHaveCount(50);
      let releaseComments!: () => void, commentsReady!: () => void;
      const commentsGate = new Promise<void>((resolve) => { releaseComments = resolve; });
      const commentsCaptured = new Promise<void>((resolve) => { commentsReady = resolve; });
      const commentsPattern = `**/canvases/${canvasId}/comments?**`;
      await page.route(commentsPattern, async (route) => {
        if (!new URL(route.request().url()).searchParams.has("cursor")) return route.continue();
        const response = await route.fetch();
        commentsReady(); await commentsGate;
        await route.fulfill({ response });
      });
      await board.getByRole("button", { name: "Load more feedback", exact: true }).click();
      await commentsCaptured;
      await board.getByLabel("Select an item").selectOption(resizeItem.id);
      await expect(board.getByRole("list", { name: `Feedback for item ${resizeItem.id}` }).locator("li")).toHaveCount(0);
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(feedbackList.locator("li")).toHaveCount(50);
      const lateComments = page.waitForResponse((response) => new URL(response.url()).searchParams.has("cursor"));
      releaseComments(); await lateComments;
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(feedbackList.locator("li")).toHaveCount(50);
      await expect(board.getByRole("button", { name: "Load more feedback", exact: true })).toBeEnabled();
      await board.getByRole("button", { name: "Load more feedback", exact: true }).click();
      await expect(feedbackList.locator("li")).toHaveCount(100);
      await page.unroute(commentsPattern);
      await prisma.canvasItemComment.deleteMany({ where: { itemId: moveItem.id } });

      // Hold an old cancellation reload until a newer reload has applied.
      let releaseOld!: () => void;
      let oldReady!: () => void;
      const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
      const oldCaptured = new Promise<void>((resolve) => { oldReady = resolve; });
      let itemReads = 0;
      const itemsPattern = `**/canvases/${canvasId}/items`;
      await page.route(itemsPattern, async (route) => {
        if (route.request().method() !== "GET" || ++itemReads !== 1) return route.continue();
        const response = await route.fetch();
        oldReady();
        await oldGate;
        await route.fulfill({ response });
      });
      const cancelReload = async () => {
        const handle = board.locator(`[data-item-id="${moveItem.id}"] [data-drag-handle]`);
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        if (!box) throw new Error("Missing reload handle");
        await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
        await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })));
        await page.mouse.up();
      };
      await cancelReload();
      await oldCaptured;
      await prisma.canvasItem.update({ where: { id: moveItem.id }, data: { x: moved.x + 7 } });
      await cancelReload();
      await expect.poll(() => reentered.evaluate((el) => parseFloat((el as HTMLElement).style.left))).toBeCloseTo(moved.x + 7, 2);
      const oldResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/canvases/${canvasId}/items`));
      releaseOld();
      await oldResponse;
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect.poll(() => reentered.evaluate((el) => parseFloat((el as HTMLElement).style.left))).toBeCloseTo(moved.x + 7, 2);
      await page.unroute(itemsPattern);
      await prisma.canvasItem.update({ where: { id: moveItem.id }, data: { x: moved.x } });
      await page.reload();

      for (const selector of ["[data-drag-handle]", "[data-resize-handle]"]) {
        let releaseReload!: () => void, reloadReady!: () => void;
        const reloadGate = new Promise<void>((resolve) => { releaseReload = resolve; });
        const reloadCaptured = new Promise<void>((resolve) => { reloadReady = resolve; });
        let reads = 0;
        await page.route(itemsPattern, async (route) => {
          if (route.request().method() !== "GET" || ++reads !== 1) return route.continue();
          const response = await route.fetch();
          reloadReady(); await reloadGate;
          await route.fulfill({ response });
        });
        await cancelReload(); await reloadCaptured;
        const handle = reentered.locator(selector);
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        if (!box) throw new Error("Missing stale reload handle");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20);
        const optimistic = await reentered.evaluate((el) => [el.style.left, el.style.top, el.style.width, el.style.height]);
        const response = page.waitForResponse((entry) => new URL(entry.url()).pathname.endsWith(`/canvases/${canvasId}/items`));
        releaseReload(); await response;
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await reentered.evaluate((el) => [el.style.left, el.style.top, el.style.width, el.style.height])).toEqual(optimistic);
        await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 })));
        await page.mouse.up();
        await page.unroute(itemsPattern);
        await expect.poll(() => reentered.evaluate((el) => parseFloat(el.style.left))).toBeCloseTo(moved.x, 2);
        await expect.poll(() => reentered.evaluate((el) => parseFloat(el.style.width))).toBeCloseTo(resized.width, 2);
      }

      for (const selector of ["[data-drag-handle]", "[data-resize-handle]"]) {
        const handle = reentered.locator(selector);
        const before = await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } });
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        if (!box) throw new Error("Missing cancellation handle");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await handle.evaluate((element) => {
          element.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, pointerType: "touch", bubbles: true }));
          window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 2 }));
          window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 500, clientY: 500 }));
          window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
        });
        await page.mouse.up();
        await expect.poll(() => reentered.evaluate((el) => [parseFloat((el as HTMLElement).style.left), parseFloat((el as HTMLElement).style.width)]))
          .toEqual([Number(before.x.toFixed(3)), Number(before.width.toFixed(3))]);
        expect(await prisma.canvasItem.findUniqueOrThrow({ where: { id: moveItem.id } })).toMatchObject({ x: before.x, y: before.y, width: before.width, height: before.height });
      }
      await prisma.projectCanvas.update({ where: { id: canvasId }, data: { layoutVersion: { increment: 1 } } });
      const staleSave = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await immediateDrag(page, reentered.locator("[data-drag-handle]"), 20, 10);
      expect((await staleSave).status()).toBe(409);
      await expect(board.getByRole("alert")).toContainText("board changed elsewhere");
      await expect.poll(() => reentered.evaluate((el) => parseFloat((el as HTMLElement).style.left))).toBeCloseTo(moved.x, 2);
      await reentered.focus();
      const keyboardMove = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await reentered.press("Alt+ArrowRight");
      expect((await keyboardMove).status()).toBe(200);
      await expect.poll(async () => (await prisma.canvasItem.findUnique({ where: { id: moveItem.id }, select: { x: true } }))?.x ?? 0).toBeCloseTo(moved.x + 10, 4);

      await board.getByLabel("Select an item").selectOption(resizeItem.id);
      const widthField = board.getByLabel("Width", { exact: true });
      await expect(widthField).toHaveAttribute("type", "text");
      await widthField.fill("-");
      await expect(widthField).toHaveValue("-");
      await widthField.fill("340");
      const xField = board.getByLabel("X position", { exact: true });
      await xField.fill("-");
      await expect(xField).toHaveValue("-");
      await xField.fill("-123");
      const numericSave = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await board.getByRole("button", { name: "Save layout", exact: true }).click();
      expect((await numericSave).status()).toBe(200);
      expect(await prisma.canvasItem.findUnique({ where: { id: resizeItem.id }, select: { x: true, width: true } })).toMatchObject({ x: -123, width: 340 });

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
      await board.getByLabel("Select an item").selectOption(archiveItem.id);
      const archiveSelected = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/items/${archiveItem.id}`) && response.request().method() === "DELETE");
      await board.getByRole("button", { name: "Archive selected item", exact: true }).click();
      expect((await archiveSelected).status()).toBe(200);
      await expect(board.getByText("Archived item · comments stay with this item", { exact: true })).toBeVisible();
      const archiveInPanel = page.getByRole("region", { name: "Canvas items", exact: true }).getByRole("article", { name: "Note, archived" }).filter({ hasText: "Archive target" });
      await expect(archiveInPanel).toContainText("Archived. This item and its attribution remain in the Canvas history.");
      await expect(viewport.locator(`[data-item-id="${archiveItem.id}"]`)).toBeVisible();
      await board.getByRole("button", { name: "Hide archived items", exact: true }).click();
      await board.getByRole("button", { name: "Fit", exact: true }).click();
      const activeOnlyFit = await world.getAttribute("style");
      await board.getByRole("button", { name: "Show archived items", exact: true }).click();
      await board.getByRole("button", { name: "Fit", exact: true }).click();
      expect(await world.getAttribute("style")).not.toBe(activeOnlyFit);
      const fitBounds = await Promise.all([viewport.boundingBox(), viewport.locator(`[data-item-id="${archiveItem.id}"]`).boundingBox()]);
      expect(fitBounds[0]).not.toBeNull();
      expect(fitBounds[1]).not.toBeNull();
      expect(fitBounds[1]!.x).toBeGreaterThanOrEqual(fitBounds[0]!.x - 1);
      expect(fitBounds[1]!.y).toBeGreaterThanOrEqual(fitBounds[0]!.y - 1);
      expect(fitBounds[1]!.x + fitBounds[1]!.width).toBeLessThanOrEqual(fitBounds[0]!.x + fitBounds[0]!.width + 1);
      expect(fitBounds[1]!.y + fitBounds[1]!.height).toBeLessThanOrEqual(fitBounds[0]!.y + fitBounds[0]!.height + 1);
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      const archivedLayerResponse = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await board.getByRole("button", { name: "Send to back", exact: true }).click();
      const archivedLayerResult = await (await archivedLayerResponse).json() as { items: Array<{ id: string; zIndex: number; archivedAt: string | null }> };
      expect(archivedLayerResult.items.map((item) => [item.id, item.zIndex, Boolean(item.archivedAt)]))
        .toEqual([[moveItem.id, 0, false], [resizeItem.id, 1, false], [archiveItem.id, 2, true]]);
      await board.getByRole("button", { name: "Hide archived items", exact: true }).click();
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      const resizeHandleOnSelected = board.locator(`[data-item-id="${resizeItem.id}"] [data-resize-handle]`);
      await dragBy(page, resizeHandleOnSelected, 18, 12, "bottomRight");
      await expect(board.getByLabel("Select an item")).toHaveValue(resizeItem.id);
      await expect.poll(async () => (await prisma.canvasItem.findUnique({ where: { id: resizeItem.id }, select: { width: true } }))?.width ?? 0).toBeGreaterThan(340);
      const boundaryItem = await prisma.canvasItem.update({ where: { id: resizeItem.id }, data: { x: 1_000_000 } });
      await page.reload();
      const boundaryCard = board.locator(`[data-item-id="${boundaryItem.id}"]`);
      await boundaryCard.focus();
      const boundarySave = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/layout") && response.request().method() === "PATCH");
      await boundaryCard.press("Alt+ArrowRight");
      expect((await boundarySave).status()).toBe(200);
      expect(await prisma.canvasItem.findUnique({ where: { id: boundaryItem.id }, select: { x: true } })).toMatchObject({ x: 1_000_000 });
      await prisma.canvasItem.update({ where: { id: boundaryItem.id }, data: { x: 360 } });
      await page.reload();
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      const worldBeforePan = await world.getAttribute("style");
      await viewport.focus();
      await viewport.press("ArrowRight");
      expect(await world.getAttribute("style")).not.toBe(worldBeforePan);
      const zoomBefore = await board.getByLabel("Zoom level").textContent();
      await board.getByRole("button", { name: "Zoom in" }).click();
      expect(await board.getByLabel("Zoom level").textContent()).not.toBe(zoomBefore);
      await board.getByRole("button", { name: "Reset", exact: true }).click();

      for (const theme of ["light", "dark"] as const) {
        await page.getByLabel("Theme").selectOption(theme);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

        await page.setViewportSize({ width: 1440, height: 768 });
        await board.getByRole("button", { name: "Fit", exact: true }).click();
        const desktopDimensions = await page.evaluate(() => ({
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          boardWidth: document.querySelector<HTMLElement>("[aria-label='Canvas board']")?.getBoundingClientRect().width ?? 0,
        }));
        expect(desktopDimensions.documentWidth).toBeLessThanOrEqual(desktopDimensions.viewportWidth);
        expect(desktopDimensions.boardWidth).toBeLessThanOrEqual(1440);
        await page.screenshot({ fullPage: true, style: "nextjs-portal { display: none !important; }", path: testInfo.outputPath(`canvas-board-desktop-1440x768-${theme}.png`) });

        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 });
          await board.getByRole("button", { name: "Fit", exact: true }).click();
          const mobileDimensions = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            boardWidth: document.querySelector<HTMLElement>("[aria-label='Canvas board']")?.getBoundingClientRect().width ?? 0,
          }));
          expect(mobileDimensions.documentWidth).toBeLessThanOrEqual(mobileDimensions.viewportWidth);
          expect(mobileDimensions.boardWidth).toBeLessThanOrEqual(width);
          await expect(board.getByRole("button", { name: "Fit", exact: true })).toBeVisible();
          await page.screenshot({ fullPage: true, style: "nextjs-portal { display: none !important; }", path: testInfo.outputPath(`canvas-board-mobile-${width}-${theme}.png`) });

          await viewport.focus();
          const beforeMobilePan = await world.getAttribute("style");
          await viewport.press("ArrowDown");
          expect(await world.getAttribute("style")).not.toBe(beforeMobilePan);
        }
      }
      await page.setViewportSize({ width: 1440, height: 768 });
      await page.getByLabel("Theme").selectOption("light");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

      await owner.goto(detailPath);
      const ownerBoard = owner.getByRole("region", { name: "Canvas board" });
      await expect(ownerBoard.getByRole("region", { name: /Spatial Canvas/ })).toBeVisible();
      await expect(ownerBoard.getByLabel("Select an item").locator("option")).toHaveCount(4);
      await board.getByRole("button", { name: "Fit", exact: true }).click();
      const scrollCard = board.locator(`[data-item-id="${resizeItem.id}"]`);
      const wheelView = await world.getAttribute("style");
      await scrollCard.hover();
      await page.mouse.wheel(0, 250);
      await expect.poll(() => scrollCard.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await world.getAttribute("style")).toBe(wheelView);
      const viewportBox = await viewport.boundingBox();
      if (!viewportBox) throw new Error("Missing viewport");
      await viewport.hover({ position: { x: viewportBox.width - 8, y: viewportBox.height / 2 } });
      await page.mouse.wheel(0, -100);
      await expect.poll(() => world.getAttribute("style")).not.toBe(wheelView);
      const composer = page.getByRole("region", { name: "Canvas items", exact: true });
      await board.getByLabel("Select an item").selectOption(resizeItem.id);
      await board.getByRole("textbox", { name: "Add feedback", exact: true }).fill("Keep my feedback draft");
      await board.getByRole("button", { name: "Zoom in", exact: true }).click();
      const keptView = await world.getAttribute("style");
      await composer.getByRole("textbox", { name: "Note", exact: true }).fill("Refresh without remount");
      await composer.getByRole("button", { name: "Add item", exact: true }).click();
      const added = composer.getByRole("article", { name: "Note", exact: true }).filter({ hasText: "Refresh without remount" });
      await expect(added).toBeVisible();
      await expect(board.locator("[data-item-id]").filter({ hasText: "Refresh without remount" })).toHaveCount(1);
      await expect(board.getByRole("textbox", { name: "Add feedback", exact: true })).toHaveValue("Keep my feedback draft");
      await expect(board.getByLabel("Select an item")).toHaveValue(resizeItem.id);
      expect(await world.getAttribute("style")).toBe(keptView);
      await added.getByRole("button", { name: "Archive", exact: true }).click();
      await expect(composer.getByRole("article", { name: "Note, archived", exact: true }).filter({ hasText: "Refresh without remount" })).toHaveAttribute("data-archived", "true");
      await expect(board.getByRole("textbox", { name: "Add feedback", exact: true })).toHaveValue("Keep my feedback draft");
      expect(await world.getAttribute("style")).toBe(keptView);

      await ownerBoard.getByLabel("Select an item").selectOption(moveItem.id);
      await ownerBoard.getByRole("textbox", { name: "Add feedback", exact: true }).fill("Keep this with the moved note");
      await ownerBoard.getByRole("button", { name: "Post feedback", exact: true }).click();
      await expect(ownerBoard.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      const commentsUrl = `**/api/projects/${slug}/canvases/${canvasId}/comments`;
      let committedCommentResponse = 0;
      await owner.route(commentsUrl, async (route) => {
        if (route.request().method() !== "POST") { await route.continue(); return; }
        const response = await route.fetch();
        committedCommentResponse = response.status();
        await route.fulfill({ status: 502, contentType: "text/plain", body: "Response lost after the write committed" });
      });
      await ownerBoard.getByRole("textbox", { name: "Add feedback", exact: true }).fill("Saved, but response was lost");
      await ownerBoard.getByRole("button", { name: "Post feedback", exact: true }).click();
      await expect(ownerBoard.getByRole("status").filter({ hasText: "We could not confirm whether feedback was saved" })).toBeVisible();
      expect(committedCommentResponse).toBe(201);
      expect(await prisma.canvasItemComment.count({ where: { itemId: moveItem.id, body: "Saved, but response was lost" } })).toBe(1);
      await ownerBoard.getByLabel("Select an item").selectOption(resizeItem.id);
      await expect(ownerBoard.getByText("Keep this with the moved note", { exact: true })).toHaveCount(0);
      await expect(ownerBoard.getByRole("status").filter({ hasText: "We could not confirm whether feedback was saved" })).toBeVisible();
      await ownerBoard.getByRole("textbox", { name: "Add feedback", exact: true }).fill("Do not submit twice");
      await expect(ownerBoard.getByRole("button", { name: "Post feedback", exact: true })).toBeDisabled();
      expect(await prisma.canvasItemComment.count({ where: { itemId: moveItem.id, body: "Saved, but response was lost" } })).toBe(1);
      await owner.unroute(commentsUrl);
      await ownerBoard.getByRole("button", { name: "Reload Canvas", exact: true }).click();
      await ownerBoard.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(ownerBoard.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await expect(ownerBoard.getByText("Saved, but response was lost", { exact: true })).toBeVisible();

      await board.getByLabel("Select an item").selectOption(resizeItem.id);
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(board.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await composer.getByRole("textbox", { name: "Note", exact: true }).fill("Keep my item draft");
      await board.getByRole("button", { name: "Archive selected item", exact: true }).click();
      await expect(board.getByText("Archived item · comments stay with this item", { exact: true })).toBeVisible();
      await expect(board.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await expect(board.getByRole("button", { name: "Post feedback", exact: true })).toHaveCount(0);
      await expect(composer.getByRole("textbox", { name: "Note", exact: true })).toHaveValue("Keep my item draft");
      await expect(board.locator(`[data-item-id="${moveItem.id}"] [data-drag-handle]`)).toHaveCount(0);

      expect((await owner.request.patch(`/api/projects/${slug}/canvases/${canvasId}`, { data: { action: "revoke" } })).status()).toBe(200);
      await page.reload();
      await board.getByLabel("Select an item").selectOption(moveItem.id);
      await expect(board.getByText(/read-only/i).first()).toBeVisible();
      await expect(board.getByText("Keep this with the moved note", { exact: true })).toBeVisible();
      await expect(board.getByRole("button", { name: "Post feedback", exact: true })).toHaveCount(0);
      await expect(board.locator("[data-drag-handle]")).toHaveCount(0);
      expect(duplicateKeyWarnings).toEqual([]);
    } finally {
      const projectFilters = [
        ...(projectId ? [{ id: projectId }] : []),
        ...(ownerId ? [{ ownerId }] : []),
      ];
      if (projectFilters.length) await prisma.project.deleteMany({ where: { OR: projectFilters } });
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

async function dragBy(page: Page, handle: import("@playwright/test").Locator, dx: number, dy: number, anchor: "center" | "bottomRight" = "center") {
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeVisible();
  await expect(handle).toBeEnabled();
  const box = await handle.boundingBox();
  if (!box) throw new Error("Canvas drag handle is not visible");
  const x = box.x + (anchor === "bottomRight" ? box.width - 4 : Math.min(box.width / 2, 20));
  const y = box.y + (anchor === "bottomRight" ? box.height - 4 : Math.min(box.height / 2, 16));
  await handle.click({ trial: true, position: { x: x - box.x, y: y - box.y } });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

async function immediateDrag(page: Page, handle: import("@playwright/test").Locator, dx: number, dy: number) {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) throw new Error("Missing pointer handle");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await handle.evaluate((element, { x, y, dx, dy }) => {
    element.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: x + dx, clientY: y + dy, bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: x + 300, clientY: y + 300 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: x + dx, clientY: y + dy, bubbles: true }));
  }, { x, y, dx, dy });
  await page.mouse.up();
}