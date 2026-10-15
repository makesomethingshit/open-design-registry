import { beforeEach, expect, it, vi } from "vitest";
import { cleanupDocumentImages, cleanupOptions } from "./document-image-cleanup.mjs";
const key = "project-documents/project/00000000-0000-4000-8000-000000000001.png";
const now = new Date("2026-10-10T00:00:00Z");
const old = new Date("2026-09-01T00:00:00Z");
let tx, prisma, client;
beforeEach(() => {
  tx = { $queryRaw: vi.fn(), $queryRawUnsafe: vi.fn().mockResolvedValue([]), $executeRawUnsafe: vi.fn() };
  for (const model of ["project", "preview", "revision", "change", "revisionRightsItem"]) tx[model] = { findFirst: vi.fn().mockResolvedValue(null) };
  tx.project.findMany = vi.fn().mockResolvedValue([]);
  tx.documentImageDeletion = { upsert: vi.fn().mockResolvedValue({ key }) };
  prisma = { $transaction: vi.fn((fn) => fn(tx)) };
  client = { send: vi.fn((command) => {
    if (command.constructor.name === "ListObjectsV2Command") return Promise.resolve({ Contents: [{ Key: key, LastModified: old }] });
    return Promise.resolve({ LastModified: old });
  }) };
});
// Existing fixtures represent a bucket with document objects and no Canvas objects.
const run = (options = {}) => cleanupDocumentImages({ prisma, client: { send: (command) => command.input.Prefix === "canvas-items/" ? Promise.resolve({ Contents: [] }) : client.send(command) }, bucket: "test", now, log: vi.fn(), ...options });
it("defaults to a seven-day dry-run and rejects unsafe or unknown options", () => {
  expect(cleanupOptions([])).toEqual({ apply: false, graceHours: 168 });
  expect(() => cleanupOptions(["--grace-hours", "0"])).toThrow();
  expect(() => cleanupOptions(["--grace-hours"])).toThrow();
  expect(() => cleanupOptions(["--unknown"])).toThrow();
});
it("dry-run rechecks references and object age without deleting", async () => {
  expect(await run()).toMatchObject({ candidates: 1, deleted: 0, errors: 0 });
  expect(client.send.mock.calls.map(([c]) => c.constructor.name)).toEqual(["ListObjectsV2Command", "HeadObjectCommand"]);
  expect(tx.$queryRaw).toHaveBeenCalledOnce();
  expect(tx.$executeRawUnsafe).toHaveBeenCalledOnce();
  expect(tx.documentImageDeletion.upsert).not.toHaveBeenCalled();
});
it.each(["project", "preview", "revision", "change", "revisionRightsItem"])("retains objects referenced by %s", async (model) => {
  tx.$queryRawUnsafe.mockResolvedValue([{ kind: "key", value: key }]);
  expect(await run({ apply: true })).toMatchObject({ retained: 1, deleted: 0 });
  expect(client.send).toHaveBeenCalledOnce();
});
it("does not delete a recently replaced candidate", async () => {
  client.send.mockImplementation((c) => Promise.resolve(c.constructor.name === "ListObjectsV2Command" ? { Contents: [{ Key: key, LastModified: old }] } : { LastModified: now }));
  expect(await run({ apply: true })).toMatchObject({ retained: 1, deleted: 0 });
});
it("retains equivalent lowercase percent-encoded document references", async () => {
  tx.$queryRawUnsafe.mockResolvedValue([{ kind: "document", document: `![image](/api/assets?key=${encodeURIComponent(key).replaceAll("%2F", "%2f")})` }]);
  expect(await run({ apply: true })).toMatchObject({ retained: 1, deleted: 0 });
});
it("retains a rights or Revision URL using AWS path-style storage", async () => {
  tx.$queryRawUnsafe.mockResolvedValue([{ kind: "url", value: `https://s3.us-east-1.amazonaws.com/test/${key.replace("project", "%70roject")}?v=1#download` }]);
  expect(await run({ apply: true, endpoint: "" })).toMatchObject({ retained: 1, deleted: 0 });
  expect(client.send).toHaveBeenCalledOnce();
  expect(tx.documentImageDeletion.upsert).not.toHaveBeenCalled();
});
it("skips recent, malformed and non-document objects", async () => {
  client.send.mockResolvedValue({ Contents: [{ Key: key, LastModified: now }, { Key: "covers/image.png", LastModified: old }, { Key: "project-documents/project/manual.png", LastModified: old }, { Key: key }] });
  expect(await run({ apply: true })).toMatchObject({ retained: 4, deleted: 0 });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
it("continues after a failed deletion and retries only remaining objects on a later run", async () => {
  let failed = true;
  client.send.mockImplementation((c) => {
    if (c.constructor.name === "ListObjectsV2Command") return Promise.resolve({ Contents: [{ Key: key, LastModified: old }] });
    if (c.constructor.name === "DeleteObjectCommand" && failed) return Promise.reject(new Error("S3 unavailable"));
    return Promise.resolve({ LastModified: old });
  });
  expect(await run({ apply: true })).toMatchObject({ deleted: 0, errors: 1 });
  failed = false;
  expect(await run({ apply: true })).toMatchObject({ deleted: 1, errors: 0 });
});
it("follows continuation tokens without skipping pages", async () => {
  client.send.mockImplementation((c) => {
    if (c.constructor.name !== "ListObjectsV2Command") return Promise.resolve({ LastModified: old });
    return Promise.resolve(c.input.ContinuationToken ? { Contents: [{ Key: key, LastModified: old }] } : { Contents: [], IsTruncated: true, NextContinuationToken: "page2" });
  });
  expect(await run()).toMatchObject({ scanned: 1, candidates: 1 });
  expect(client.send.mock.calls[1][0].input.ContinuationToken).toBe("page2");
});
it("retries orphaned Canvas objects while retaining referenced and archived assets", async () => {
  const canvasKey = "canvas-items/canvas/00000000-0000-4000-8000-000000000001.png";
  const canvasClient = { send: vi.fn((command) => {
    if (command.constructor.name === "ListObjectsV2Command") return Promise.resolve({ Contents: command.input.Prefix === "canvas-items/" ? [{ Key: canvasKey, LastModified: old }] : [] });
    return Promise.resolve({ LastModified: old });
  }) };
  tx.$queryRawUnsafe.mockResolvedValueOnce([{ kind: "key", value: canvasKey }]);
  expect(await run({ client: canvasClient, apply: true })).toMatchObject({ retained: 1, deleted: 0 });
  canvasClient.send.mockImplementationOnce(() => Promise.resolve({ Contents: [] }));
  expect(await run({ client: canvasClient, apply: true })).toMatchObject({ deleted: 1, errors: 0 });
  expect(tx.documentImageDeletion.upsert).toHaveBeenCalledWith({ where: { key: canvasKey }, create: { key: canvasKey }, update: {} });
});
