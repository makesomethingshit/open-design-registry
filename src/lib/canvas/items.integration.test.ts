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
    mocks.get.mockImplementation(async () => ({ Body: { transformToWebStream: () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }) }, ContentType: "image/png" }));
    const suffix = crypto.randomUUID();
    [ownerId, authorId] = ["owner", "author"].map((role) => `canvas-item-${role}-${suffix}`);
    for (const id of [ownerId, authorId]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    slug = `canvas-item-${suffix}`;
    projectId = (await prisma.project.create({ data: { slug, ownerId, title: "Canvas", description: "", license: "MIT", coverUrl: "", isPublic: true } })).id;
    canvasId = (await applyForCanvas(slug, authorId)).id;
    await changeCanvasAccess(slug, canvasId, ownerId, "approve");
  });
  afterEach(async () => {
    await prisma.moderationAssetBlock.deleteMany({ where: { key: { startsWith: `canvas-items/${canvasId}/` } } });
    await prisma.documentImageDeletion.deleteMany({ where: { key: { startsWith: `canvas-items/${canvasId}/` } } });
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
  it("does not attach an upload marked for cleanup while storage was in flight", async () => {
    mocks.put.mockImplementationOnce(async (_file, key) => { await prisma.documentImageDeletion.create({ data: { key } }); });
    await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toMatchObject({ status: 409 });
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(await prisma.canvasItem.count({ where: { canvasId } })).toBe(0);
  });
  it("keeps committed bytes when the transaction commit response is lost", async () => {
    const transaction = prisma.$transaction.bind(prisma);
    let calls = 0;
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation(async (callback, options) => {
      const result = await transaction(callback, options);
      if (++calls === 2) throw new Error("commit response lost");
      return result;
    });
    try {
      await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toThrow("commit response lost");
      const item = await prisma.canvasItem.findFirstOrThrow({ where: { canvasId } });
      expect(item.assetKey).toBe(mocks.put.mock.calls[0][1]);
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(await prisma.documentImageDeletion.findUnique({ where: { key: item.assetKey! } })).toBeNull();
    } finally {
      spy.mockRestore();
      Object.defineProperty(prisma, "$transaction", { value: transaction, configurable: true, writable: true });
    }
  });

  it("defers deletion when the database cannot prove that an upload is unreferenced", async () => {
    const transaction = prisma.$transaction.bind(prisma);
    let calls = 0;
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation(async (callback, options) => {
      if (++calls === 2) throw new Error("database unavailable");
      return transaction(callback, options);
    });
    mocks.put.mockRejectedValueOnce(new Error("ambiguous PUT"));
    try {
      await expect(createCanvasItem(slug, canvasId, authorId, metadata, image())).rejects.toBeInstanceOf(AggregateError);
      expect(mocks.remove).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      Object.defineProperty(prisma, "$transaction", { value: transaction, configurable: true, writable: true });
    }
  });

  it("releases project and Canvas locks during a delayed read and rejects after a private transition", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const buffering = new Promise<void>((r) => { ready = r; });
    mocks.get.mockResolvedValueOnce({ ContentType: "image/png", Body: { transformToWebStream: () => new ReadableStream({ async pull(c) { ready(); await gate; c.enqueue(new Uint8Array([1])); c.close(); } }) } });
    const read = getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
    await buffering;
    await expect(prisma.project.update({ where: { id: projectId }, data: { isPublic: false } })).resolves.toMatchObject({ isPublic: false });
    release();
    expect((await read).status).toBe(404);
  });
  it("lets a revocation finish during a delayed read and preserves public read-only history", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetching = new Promise<void>((r) => { ready = r; });
    mocks.get.mockResolvedValueOnce({ ContentType: "image/png", Body: { transformToWebStream: () => new ReadableStream({ async pull(c) { ready(); await gate; c.enqueue(new Uint8Array([1])); c.close(); } }) } });
    const read = getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
    await fetching;
    await expect(changeCanvasAccess(slug, canvasId, ownerId, "revoke")).resolves.toMatchObject({ accessStatus: "REVOKED" });
    release();
    expect((await read).status).toBe(200);
  });
  it("rechecks moderation after a delayed storage read", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    let release!: () => void, ready!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const fetching = new Promise<void>((r) => { ready = r; });
    mocks.get.mockResolvedValueOnce({ ContentType: "image/png", Body: { transformToWebStream: () => new ReadableStream({ async pull(c) { ready(); await gate; c.enqueue(new Uint8Array([1])); c.close(); } }) } });
    const read = getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
    await fetching;
    await prisma.moderationAssetBlock.create({ data: { key: item.assetKey!, reportId: crypto.randomUUID(), blockedById: ownerId, reason: "Concurrent moderation" } });
    release();
    expect((await read).status).toBe(404);
  });

  it("times out delayed storage headers and cancels the response body that arrives afterward", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    let resolveFetch!: (object: unknown) => void;
    mocks.get.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const nativeSetTimeout = globalThis.setTimeout;
    const timeout = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: TimerHandler, delay = 0, ...args: unknown[]) =>
      nativeSetTimeout(callback, delay === 10_000 ? 10 : delay, ...args)) as typeof setTimeout);
    const read = getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
    try {
      await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledOnce());
      expect((await read).status).toBe(404);
    } finally { timeout.mockRestore(); }
    const lateCancel = vi.fn();
    resolveFetch({ ContentType: "image/png", Body: { transformToWebStream: () => new ReadableStream({ cancel: lateCancel }) } });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(lateCancel).toHaveBeenCalledOnce();
  });
  it("times out a storage body that stalls while buffering", async () => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    let streamStarted!: () => void;
    const started = new Promise<void>((resolve) => { streamStarted = resolve; });
    const cancel = vi.fn();
    mocks.get.mockResolvedValueOnce({ ContentType: "image/png", Body: { transformToWebStream: () => new ReadableStream({ pull() { streamStarted(); return new Promise<void>(() => {}); }, cancel }) } });
    const nativeSetTimeout = globalThis.setTimeout;
    const timeout = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: TimerHandler, delay = 0, ...args: unknown[]) =>
      nativeSetTimeout(callback, delay === 10_000 ? 10 : delay, ...args)) as typeof setTimeout);
    try {
      const read = getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
      await started;
      expect((await read).status).toBe(404);
      expect(cancel).toHaveBeenCalledOnce();
    } finally { timeout.mockRestore(); }
  });
  it.each([undefined, 1])("caps storage streams with absent or inaccurate length %s before buffering oversized bytes", async (length) => {
    const item = await createCanvasItem(slug, canvasId, authorId, metadata, image());
    const cancel = vi.fn();
    let chunks = 0;
    mocks.get.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: length, Body: { transformToWebStream: () => new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(++chunks === 1 ? 10 * 1024 * 1024 : 1)); }, cancel,
    }) } });
    const response = await getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`));
    expect(response.status).toBe(404);
    expect(cancel).toHaveBeenCalledOnce();
    expect(chunks).toBeLessThanOrEqual(3);
  });

  it("commits an attachment before a waiting revocation and preserves its public history", async () => {
    const name = `canvas_item_gate_${crypto.randomUUID().replaceAll("-", "")}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger AS $$ BEGIN PERFORM pg_advisory_xact_lock(167, 1); RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${name}" BEFORE INSERT ON "CanvasItem" FOR EACH ROW WHEN (NEW."canvasId" = '${canvasId}') EXECUTE FUNCTION "${name}"()`);
    let release!: () => void, ready!: (pid: number) => void;
    const gate = new Promise<void>((r) => { release = r; });
    const locked = new Promise<number>((r) => { ready = r; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(167, 1)::text`;
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      ready(pid); await gate;
    });
    const waitForWaiter = async (pid: number) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
        if (rows.length) return rows[0].pid;
        await new Promise<void>((r) => setImmediate(r));
      }
      throw new Error("Expected production writer to wait on a PostgreSQL lock");
    };
    const holderPid = await locked;
    const uploading = createCanvasItem(slug, canvasId, authorId, metadata, image());
    void uploading.catch(() => {});
    let revoking: ReturnType<typeof changeCanvasAccess> | undefined;
    try {
      const uploadPid = await waitForWaiter(holderPid);
      revoking = changeCanvasAccess(slug, canvasId, ownerId, "revoke"); void revoking.catch(() => {});
      await waitForWaiter(uploadPid);
    } finally {
      release(); await holder;
      await Promise.allSettled([uploading, ...(revoking ? [revoking] : [])]);
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "CanvasItem"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
    const item = await uploading;
    expect((await revoking)?.accessStatus).toBe("REVOKED");
    expect(await prisma.canvasItem.findUnique({ where: { id: item.id } })).not.toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect((await getAsset(new Request(`http://localhost/api/assets?key=${encodeURIComponent(item.assetKey!)}`))).status).toBe(200);
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
