import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteObject } from "../src/lib/storage";

const prisma = new PrismaClient();
test.describe("Canvas browser API integration", () => {
  test.skip(!process.env.E2E_INTEGRATION, "requires disposable PostgreSQL and S3-compatible storage");
  test.setTimeout(90_000);
  test.afterAll(() => prisma.$disconnect());

  test("uses real browser cookies for membership, image ACL, layout conflicts and feedback restrictions", async ({ page, browser }) => {
    const suffix = crypto.randomUUID();
    const authorContext = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000" });
    const author = await authorContext.newPage();
    const users: string[] = [];
    let projectId: string | undefined, assetKey: string | undefined;
    try {
      for (const [surface, role] of [[page, "owner"], [author, "author"]] as const) {
        await surface.goto("/login");
        await surface.getByRole("button", { name: "New here? Create an account" }).click();
        await surface.getByLabel("Name").fill(`Canvas ${role}`);
        await surface.getByLabel("Email").fill(`canvas-${role}-${suffix}@example.test`);
        await surface.getByLabel("Password").fill("canvas-browser-password-123");
        await surface.getByRole("button", { name: "Create account", exact: true }).click();
        await expect(surface.getByRole("button", { name: /^Account/ })).toBeVisible();
        const session = await surface.request.get("/api/auth/get-session");
        users.push((await session.json()).user.id);
      }
      const slug = `canvas-browser-${suffix}`;
      projectId = (await prisma.project.create({ data: { slug, ownerId: users[0], title: "Browser Canvas", description: "", license: "MIT", coverUrl: "", isPublic: true } })).id;
      const path = `/api/projects/${slug}/canvases`;
      const application = await call(author, path, "POST");
      expect(application.status).toBe(200);
      const canvasId = application.body.id as string;
      expect((await call(page, `${path}/${canvasId}`, "PATCH", { action: "approve" })).status).toBe(200);
      const itemPath = `${path}/${canvasId}/items`;
      const uploaded = await author.evaluate(async (url) => {
        const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), (v) => v.charCodeAt(0));
        const form = new FormData();
        form.set("kind", "IMAGE"); form.set("origin", "ORIGINAL"); form.set("altText", "One pixel");
        form.set("file", new File([bytes], "pixel.png", { type: "image/png" }));
        const response = await fetch(url, { method: "POST", body: form });
        return { status: response.status, body: await response.json() };
      }, itemPath);
      expect(uploaded.status).toBe(201);
      const itemId = uploaded.body.id as string; assetKey = uploaded.body.assetKey;
      expect((await page.request.get(`/api/assets?key=${encodeURIComponent(assetKey!)}`)).status()).toBe(200);
      const layout = { itemId, expectedCanvasVersion: 0, rect: { x: -120, y: 200, width: 400, height: 240, zIndex: 2 } };
      const statuses = await author.evaluate(async ({ url, body }) => Promise.all([1, 2].map(async () => (await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).status)), { url: `${path}/${canvasId}/layout`, body: layout });
      expect(statuses.sort()).toEqual([200, 409]);
      expect((await call(author, `${path}/${canvasId}`, "GET")).body.layoutVersion).toBe(1);
      const comments = `${path}/${canvasId}/comments`;
      expect((await call(page, comments, "POST", { itemId, body: "Real browser feedback" })).status).toBe(201);
      expect((await call(author, `${itemPath}/${itemId}`, "DELETE")).status).toBe(200);
      expect((await call(page, comments, "POST", { itemId, body: "Too late" })).status).toBe(409);
      expect((await call(page, `${path}/${canvasId}`, "PATCH", { action: "revoke" })).status).toBe(200);
      expect((await call(page, comments, "POST", { itemId, body: "Revoked" })).status).toBe(403);
      expect((await call(page, `${comments}?itemId=${itemId}`, "GET")).body).toMatchObject([{ itemId, body: "Real browser feedback" }]);
      await prisma.project.update({ where: { id: projectId }, data: { isPublic: false } });
      expect((await page.request.get(`/api/assets?key=${encodeURIComponent(assetKey!)}`)).status()).toBe(404);
    } finally {
      if (assetKey) await deleteObject(assetKey);
      if (projectId) await prisma.project.delete({ where: { id: projectId } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await authorContext.close();
    }
  });
});

async function call(page: Page, url: string, method: string, body?: unknown) {
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, { url, method, body });
}
