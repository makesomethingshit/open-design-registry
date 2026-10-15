import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../prisma";
import { applyForCanvas, changeCanvasAccess } from "./service";
import { archiveCanvasItem, createCanvasItem } from "./items";
import { canvasItemRequest } from "./item-handlers";
import { GET as getAsset } from "../../../app/api/assets/route";

const mocks = vi.hoisted(() => ({ actorId: null as string | null, put: vi.fn(), remove: vi.fn(), get: vi.fn() }));
vi.mock("../auth", () => ({ auth: { api: { getSession: async () => mocks.actorId ? { user: { id: mocks.actorId } } : null } } }));
vi.mock("../storage", async (original) => ({ ...await original<typeof import("../storage")>(), putObject: mocks.put, deleteObject: mocks.remove, getObject: mocks.get }));
const db = process.env.RUN_PROPOSAL_CONCURRENCY_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const image = () => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], "image.png", { type: "image/png" });
const metadata = { kind: "IMAGE", origin: "ORIGINAL", altText: "Example" };

db("Canvas item PostgreSQL + injected storage failures", () => {
  let ownerId: string, authorId: string, projectId: string, slug: string, canvasId: string;
  beforeEach(async () => {
    vi.clearAllMocks(); mocks.actorId = null;
    mocks.put.mockResolvedValue("unused"); mocks.remove.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue({ Body: new Uint8Array([1]), ContentType: "image/png" });
    const suffix = crypto.randomUUID();
    [ownerId, authorId] = ["owner", "author"].map((role) => `canvas-item-${role}-${suffix}`);
    for (const id of [ownerId, authorId]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    slug = `canvas-item-${suffix}`;
    projectId = (await prisma.project.create({ data: { slug, ownerId, title: "Canvas", description: "", license: "MIT", coverUrl: "", isPublic: true } })).id;
    canvasId = (await applyForCanvas(slug, authorId)).id;
    await changeCanvasAccess(slug, canvasId, ownerId, "approve");
  });
  afterEach(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, authorId] } } });
  });

  it.each(["revoke", "private"])("cleans a completed upload when %s wins before DB attachment", async (change) => {
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => { started = r; });
    const gate = new Promise<void>((r) => { release = r; });
    mocks.put.mockImplementation(async () => { started(); await gate; });
    const uploading = createCanvasItem(slug, canvasId, authorId, metadata, image());
    const result = uploading.catch((error) => error);
    await ready;
    try {
      if (change === "revoke") await changeCanvasAccess(slug, canvasId, ownerId, "revoke");
      else await prisma.project.update({ where: { id: projectId }, data: { isPublic: false } });
    } finally { release(); }
    expect(await result).toBeInstanceOf(Error);
    expect(await prisma.canvasItem.count({ where: { canvasId } })).toBe(0);
    expect(mocks.remove).toHaveBeenCalledWith(mocks.put.mock.calls[0][1]);
  });

  it("attempts deletion after an ambiguous failed PUT and reports cleanup failure", async () => {
    mocks.put.mockRejectedValueOnce(new Error("PUT response lost"));
    await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toThrow("PUT response lost");
    expect(mocks.remove).toHaveBeenCalledOnce();
    mocks.put.mockRejectedValueOnce(new Error("PUT response lost"));
    mocks.remove.mockRejectedValueOnce(new Error("DELETE unavailable"));
    await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toBeInstanceOf(AggregateError);
    expect(await prisma.canvasItem.count({ where: { canvasId } })).toBe(0);
  });

  it("cleans uploaded bytes if a real database insert fails", async () => {
    const name = `canvas_item_fail_${crypto.randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'item insertion failed'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "CanvasItem" FOR EACH ROW WHEN (NEW."canvasId" = '${canvasId}') EXECUTE FUNCTION "${name}"()`);
    try {
      await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toThrow("item insertion failed");
      expect(mocks.remove).toHaveBeenCalledOnce();
      expect(await prisma.canvasItem.count({ where: { canvasId } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "CanvasItem"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
  });

  it("serves only DB-referenced Canvas assets, retains approved history, hides private projects", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    const read = (key: string) => getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(key)}`));
    expect((await read(item.assetKey!)).status).toBe(200);
    expect((await read(`canvas-items/${canvasId}/guessed.png`)).status).toBe(404);
    await archiveCanvasItem(slug, canvasId, item.id, authorId);
    await changeCanvasAccess(slug, canvasId, ownerId, "revoke");
    expect((await read(item.assetKey!)).status).toBe(200);
    await prisma.project.update({ where: { id: projectId }, data: { isPublic: false, coverUrl: `/api/assets?key=${encodeURIComponent(item.assetKey!)}` } });
    mocks.actorId = ownerId;
    expect((await read(item.assetKey!)).status).toBe(404);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("validates multipart bytes and metadata before upload and preserves attribution anonymously", async () => {
    mocks.actorId = authorId;
    const send = (file: File, extra: Record<string, string> = {}) => {
      const form = new FormData();
      for (const [key, value] of Object.entries({ ...metadata, ...extra })) form.set(key, value);
      form.set("file", file);
      return canvasItemRequest(new Request("http://localhost", { method: "POST", body: form }), { slug, canvasId });
    };
    expect((await send(new File(["html"], "x.png", { type: "image/png" }))).status).toBe(400);
    expect((await send(image(), { assetKey: "stolen" })).status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
    const response = await send(image()); expect(response.status).toBe(201);
    const item = await response.json();
    await prisma.user.delete({ where: { id: authorId } });
    expect(await prisma.canvasItem.findUnique({ where: { id: item.id } })).toMatchObject({ authorId: null, assetKey: item.assetKey });
    mocks.actorId = null;
    expect((await getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey)}`))).status).toBe(200);
  });
});
