import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../prisma";
import { applyForCanvas, changeCanvasAccess } from "./service";
import { archiveCanvasItem, createCanvasItem } from "./items";
import { createCanvasComment, editCanvasLayout, readCanvasComments } from "./feedback";
import { canvasFeedbackRequest } from "./feedback-handlers";

const session = vi.hoisted(() => ({ actorId: null as string | null }));
vi.mock("../auth", () => ({ auth: { api: { getSession: async () => session.actorId ? { user: { id: session.actorId } } : null } } }));
const db = process.env.RUN_PROPOSAL_CONCURRENCY_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const rect = { x: 300, y: -200, width: 400, height: 240, zIndex: 3 };

db("Canvas layout and feedback PostgreSQL production paths", () => {
  let ownerId: string, authorId: string, viewerId: string, projectId: string, slug: string, canvasId: string, itemId: string;
  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    [ownerId, authorId, viewerId] = ["owner", "author", "viewer"].map((role) => `canvas-feedback-${role}-${suffix}`);
    for (const id of [ownerId, authorId, viewerId]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    slug = `canvas-feedback-${suffix}`;
    projectId = (await prisma.project.create({ data: { slug, ownerId, title: "Canvas", description: "", license: "MIT", coverUrl: "", isPublic: true } })).id;
    canvasId = (await applyForCanvas(slug, authorId)).id;
    await changeCanvasAccess(slug, canvasId, ownerId, "approve");
    itemId = (await createCanvasItem(slug, canvasId, authorId, { kind: "TEXT", origin: "ORIGINAL", body: "Design notes" })).id;
    session.actorId = authorId;
  });
  afterEach(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, authorId, viewerId] } } });
  });
  const request = (method: string, body: unknown) => new Request("http://localhost", { method, body: JSON.stringify(body) });
  const layout = (version = 0, overrides = {}) => canvasFeedbackRequest(request("PATCH", { itemId, expectedCanvasVersion: version, rect, ...overrides }), { slug, canvasId });
  const stack = (stackItemId: string, version: number, action: "front" | "back") => canvasFeedbackRequest(request("PATCH", { itemId: stackItemId, expectedCanvasVersion: version, action }), { slug, canvasId });
  const comment = () => canvasFeedbackRequest(request("POST", { itemId, body: "Improve contrast" }), { slug, canvasId });

  it("atomically increments once for two competing versions and returns HTTP 409 for the loser", async () => {
    await createCanvasComment(slug, canvasId, viewerId, { itemId, body: "Stable identity" });
    const results = await Promise.all([layout(), layout()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.projectCanvas.findUnique({ where: { id: canvasId } })).toMatchObject({ layoutVersion: 1 });
    expect(await prisma.canvasItem.findUnique({ where: { id: itemId } })).toMatchObject(rect);
    expect(await readCanvasComments(slug, canvasId, itemId, null)).toMatchObject([{ itemId, body: "Stable identity" }]);
    expect((await layout()).status).toBe(409);
    expect((await layout(1)).status).toBe(200);
  });

  it("rolls back the version increment if the actual item UPDATE fails", async () => {
    const name = `canvas_layout_fail_${crypto.randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'layout persistence failed'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE UPDATE ON "CanvasItem" FOR EACH ROW WHEN (NEW.id = '${itemId}') EXECUTE FUNCTION "${name}"()`);
    try {
      await expect(layout()).rejects.toThrow("layout persistence failed");
      expect(await prisma.projectCanvas.findUnique({ where: { id: canvasId } })).toMatchObject({ layoutVersion: 0 });
      expect(await prisma.canvasItem.findUnique({ where: { id: itemId } })).toMatchObject({ x: 0, y: 0 });
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "CanvasItem"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });

  it("applies a stack operation in one versioned write and returns complete authored items", async () => {
    const second = await createCanvasItem(slug, canvasId, authorId, { kind: "TEXT", origin: "REFERENCE", body: "Second item", sourceUrl: "https://example.org/source", rightsNote: "Shared with permission" });
    await prisma.canvasItem.update({ where: { id: second.id }, data: { zIndex: 8 } });

    const response = await stack(second.id, 0, "back");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.layoutVersion).toBe(1);
    expect(result.items.map((item: { id: string; zIndex: number }) => [item.id, item.zIndex])).toEqual([[second.id, 0], [itemId, 1]]);
    expect(result.items[0]).toMatchObject({
      id: second.id, kind: "TEXT", origin: "REFERENCE", body: "Second item", sourceUrl: "https://example.org/source",
      rightsNote: "Shared with permission", author: { name: authorId },
    });
    expect(await prisma.projectCanvas.findUnique({ where: { id: canvasId } })).toMatchObject({ layoutVersion: 1 });
  });

  it("serializes a stack operation against a simultaneous rectangle save", async () => {
    const stacked = await createCanvasItem(slug, canvasId, authorId, { kind: "TEXT", origin: "ORIGINAL", body: "Stacked" });
    const results = await Promise.all([stack(stacked.id, 0, "front"), layout()]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.projectCanvas.findUnique({ where: { id: canvasId } })).toMatchObject({ layoutVersion: 1 });
    const stackWon = results[0].status === 200;
    expect(await prisma.canvasItem.findUnique({ where: { id: stacked.id }, select: { zIndex: true } })).toMatchObject({ zIndex: stackWon ? 1 : 0 });
    expect(await prisma.canvasItem.findUnique({ where: { id: itemId }, select: { zIndex: true, x: true } })).toMatchObject(stackWon ? { zIndex: 0, x: 0 } : { zIndex: 3, x: rect.x });

    const retry = await stack(stacked.id, 1, "back");
    expect(retry.status).toBe(200);
    expect((await retry.json()).layoutVersion).toBe(2);
  });

  it("rolls back every z-index update and the version when a middle stack update fails", async () => {
    const second = await createCanvasItem(slug, canvasId, authorId, { kind: "TEXT", origin: "ORIGINAL", body: "Second item" });
    await prisma.canvasItem.update({ where: { id: second.id }, data: { zIndex: 8 } });
    const name = `canvas_stack_fail_${crypto.randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'stack persistence failed'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE UPDATE ON "CanvasItem" FOR EACH ROW WHEN (NEW.id = '${itemId}') EXECUTE FUNCTION "${name}"()`);
    try {
      await expect(editCanvasLayout(slug, canvasId, authorId, { itemId: second.id, expectedCanvasVersion: 0, action: "back" })).rejects.toThrow("stack persistence failed");
      expect(await prisma.projectCanvas.findUnique({ where: { id: canvasId } })).toMatchObject({ layoutVersion: 0 });
      expect(await prisma.canvasItem.findMany({ where: { id: { in: [itemId, second.id] } }, orderBy: { id: "asc" }, select: { id: true, zIndex: true } })).toEqual(
        expect.arrayContaining([{ id: itemId, zIndex: 0 }, { id: second.id, zIndex: 8 }]),
      );
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "CanvasItem"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });

  it.each(["archive", "revoke", "private"])("waits for concurrent %s and rejects a new comment using committed state", async (action) => {
    let release!: () => void, ready!: (pid: number) => void;
    const gate = new Promise<void>((r) => { release = r; });
    const locked = new Promise<number>((r) => { ready = r; });
    const writer = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} FOR UPDATE`;
      if (action === "archive") await tx.canvasItem.update({ where: { id: itemId }, data: { archivedAt: new Date() } });
      else if (action === "revoke") await tx.projectCanvas.update({ where: { id: canvasId }, data: { accessStatus: "REVOKED" } });
      else await tx.project.update({ where: { id: projectId }, data: { isPublic: false } });
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      ready(pid); await gate;
    });
    const pid = await locked;
    const posting = comment();
    void posting.catch(() => {});
    try {
      const deadline = Date.now() + 3000;
      let blocked = false;
      while (Date.now() < deadline) {
        const [row] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))) AS blocked`;
        if (row.blocked) { blocked = true; break; }
        await new Promise<void>((r) => setImmediate(r));
      }
      expect(blocked).toBe(true);
    } finally { release(); await writer; }
    expect((await posting).status).toBe(action === "archive" ? 409 : action === "revoke" ? 403 : 404);
    expect(await prisma.canvasItemComment.count({ where: { itemId } })).toBe(0);
  });

  it("preserves comments after archival and anonymizes deleted authors", async () => {
    const created = await createCanvasComment(slug, canvasId, authorId, { itemId, body: "My feedback" });
    await archiveCanvasItem(slug, canvasId, itemId, authorId);
    expect((await comment()).status).toBe(409);
    await prisma.user.delete({ where: { id: authorId } });
    expect(await readCanvasComments(slug, canvasId, itemId, null)).toMatchObject([{ id: created.id, itemId, authorId: null, body: "My feedback", author: null }]);
    expect(await prisma.canvasItem.findUnique({ where: { id: itemId } })).toMatchObject({ authorId: null });
    expect(await prisma.projectCanvas.findUnique({ where: { id: canvasId } })).toMatchObject({ ownerId: null });
  });

  it("enforces authentication, numeric bounds, Canvas ownership, item membership and revoked/reapplication state", async () => {
    session.actorId = null; expect((await comment()).status).toBe(401);
    session.actorId = viewerId; expect((await layout()).status).toBe(403);
    session.actorId = authorId;
    expect((await layout(2_147_483_647)).status).toBe(400);
    expect((await layout(0, { itemId: "another-canvas-item" })).status).toBe(404);
    expect((await canvasFeedbackRequest(request("POST", { itemId: "another-canvas-item", body: "Hidden" }), { slug, canvasId })).status).toBe(404);
    await changeCanvasAccess(slug, canvasId, ownerId, "revoke");
    expect((await comment()).status).toBe(403); expect((await layout()).status).toBe(403);
    await applyForCanvas(slug, authorId);
    expect((await comment()).status).toBe(403);
  });
});
