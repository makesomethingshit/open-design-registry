import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  transaction: vi.fn(),
  createRevision: vi.fn(),
  updateRevision: vi.fn(),
  findLatest: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  putBundle: vi.fn(),
  readBundle: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.findProject },
  $transaction: mocks.transaction,
} }));
vi.mock("@/src/lib/storage", () => ({ putObject: mocks.putObject, deleteObject: mocks.deleteObject }));
vi.mock("@/src/lib/revision-bundle", () => ({
  putRevisionBundle: mocks.putBundle,
  readRevisionBundle: mocks.readBundle,
  capabilityForBundle: (bundle: { files: unknown[] } | null) => bundle ? { mode: "structured", unitCount: bundle.files.length } : { mode: "whole_document", unitCount: 0 },
  normalizeUnitKind: (value: string) => ["artboard", "component", "asset", "token"].includes(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null,
  normalizeUnitName: (value: string) => value.trim().replace(/[\\/\"\u0000-\u001f\u007f]/g, "-").trim() || null,
}));

const { POST } = await import("./route");

function request(fields: Record<string, string | File | Array<string | File>>, metadata = true, withKinds = true) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const entry of Array.isArray(value) ? value : [value]) form.append(key, entry);
  if (withKinds && !("sourceKinds" in fields)) {
    const sources = ["source", "sources"].flatMap((key) => {
      const value = fields[key];
      return value === undefined ? [] : Array.isArray(value) ? value : [value];
    }).filter((value): value is File => value instanceof File && Boolean(value.name));
    for (const _source of sources) form.append("sourceKinds", "asset");
  }
  if (metadata) {
    form.append("title", "Landing page update");
    form.append("changeDescription", "Updated the landing page layout");
    const previewCount = Object.entries(fields).filter(([key]) => key === "previews" || key === "preview").reduce((count, [, value]) => count + (Array.isArray(value) ? value.length : 1), 0);
    for (let index = 0; index < previewCount; index += 1) form.append("altTexts", `Preview ${index + 1}`);
  }
  return new Request("http://localhost/projects/demo/revisions", { method: "POST", body: form });
}

describe("revision publishing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner" });
    mocks.findLatest.mockResolvedValue(undefined);
    mocks.createRevision.mockResolvedValue({ id: "revision", number: 1, previews: [] });
    mocks.updateRevision.mockResolvedValue({ id: "revision", number: 1, previews: [] });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn().mockResolvedValue([{ license: "CC BY 4.0" }]),
      revision: { findFirst: mocks.findLatest, create: mocks.createRevision, update: mocks.updateRevision },
    }));
    mocks.putObject.mockImplementation(async (_file: File, key: string) => `https://cdn/${key}`);
    mocks.putBundle.mockResolvedValue({ checksum: "b".repeat(64) });
    mocks.readBundle.mockResolvedValue(null);
  });

  it("rejects a non-owner before reading or uploading the form", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(403);
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it.each([
    ["source-a.zip", "application/zip"],
    ["source-b.psd", "application/octet-stream"],
  ])("publishes different source files (%s)", async (name, type) => {
    const response = await POST(request({ source: new File(["source"], name, { type }), previews: new File(["png"], "preview.png", { type: "image/png" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putObject).toHaveBeenCalledTimes(2);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: "Landing page update", changeDescription: "Updated the landing page layout", sourceUrl: undefined, sourceKey: expect.stringMatching(/^revisions\/project\//), isPublished: false, previews: { create: [expect.objectContaining({ altText: "Preview 1" })] } }) }));
    expect(mocks.updateRevision).toHaveBeenCalledWith({ where: { id: "revision" }, data: { isPublished: true }, include: { previews: true } });
  });

  it("publishes multiple source files with explicit preview mappings", async () => {
    const response = await POST(request({
      sources: [new File(["a"], "poster.ai", { type: "application/postscript" }), new File(["b"], "logo.svg", { type: "image/svg+xml" })],
      previews: [new File(["a"], "poster.png", { type: "image/png" }), new File(["b"], "logo.jpg", { type: "image/jpeg" })],
      sourceFileIds: ["", ""],
      sourcePreviewIndexes: ["0", "1"],
    }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    const bundle = mocks.putBundle.mock.calls[0][1];
    expect(bundle.files.map((file: { name: string }) => file.name)).toEqual(["poster.ai", "logo.svg"]);
    expect(bundle.files.map((file: { previewKeys: string[] }) => file.previewKeys)).toEqual([expect.any(Array), expect.any(Array)]);
    expect(bundle.files.every((file: { previewKeys: string[] }) => file.previewKeys.length === 1)).toBe(true);
    expect(mocks.putObject).toHaveBeenCalledTimes(4);
  });

  it("stores a finalized SVG capability and adapter provenance for an Auto selection", async () => {
    const response = await POST(request({
      sources: new File(["<svg viewBox=\"0 0 10 10\"><g /></svg>"], "hero.svg", { type: "image/svg+xml" }),
      previews: new File(["png"], "hero.png", { type: "image/png" }),
      sourceKinds: "artboard",
      sourceKindModes: "auto",
      sourcePreviewIndexes: "0",
    }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      capabilityMode: "STRUCTURED", capabilityUnitCount: 1, adapterId: "svg", adapterVersion: "0.4", adapterConfidence: "LOW", adapterMaturity: "beta",
    }) }));
    expect(mocks.putBundle.mock.calls[0][1].files[0]).toMatchObject({ kind: "artboard" });
  });

  it("keeps a manual SVG override as the published kind instead of persisting Auto", async () => {
    const response = await POST(request({
      sources: new File(["<svg viewBox=\"0 0 10 10\" />"], "hero.svg", { type: "image/svg+xml" }),
      previews: new File(["png"], "hero.png", { type: "image/png" }),
      sourceKinds: "component",
      sourceKindModes: "manual",
      sourcePreviewIndexes: "0",
    }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putBundle.mock.calls[0][1].files[0]).toMatchObject({ kind: "component" });
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adapterId: undefined }) }));
  });

  it("rejects an Auto selection when the current adapter result no longer matches", async () => {
    const response = await POST(request({
      sources: new File(["<svg />"], "hero.svg", { type: "image/svg+xml" }),
      previews: new File(["png"], "hero.png", { type: "image/png" }),
      sourceKinds: "component",
      sourceKindModes: "auto",
      sourcePreviewIndexes: "0",
    }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it("requires a kind for each uploaded unit", async () => {
    const response = await POST(request({ source: new File(["source"], "poster.ai", { type: "application/postscript" }), previews: new File(["png"], "preview.png", { type: "image/png" }) }, true, false), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/kind/i) });
  });

  it("preserves an existing unit kind instead of reclassifying it", async () => {
    mocks.findLatest.mockResolvedValue({ id: "r1", number: 1, sourceKey: "r1-bundle" });
    mocks.readBundle.mockResolvedValue({ version: 2, files: [{ id: "file-a", name: "poster.ai", kind: "component", mimeType: "application/postscript", size: 1, assetKey: "old-a", previewKeys: [] }] });
    const response = await POST(request({ sources: new File(["next"], "poster.ai", { type: "application/postscript" }), previews: new File(["preview"], "poster.png", { type: "image/png" }), sourceFileIds: "file-a", sourceKinds: "token", sourcePreviewIndexes: "0" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putBundle.mock.calls[0][1]).toMatchObject({ version: 2, files: [{ id: "file-a", kind: "component" }] });
  });

  it("preserves an explicitly mapped file ID from the locked latest revision", async () => {
    mocks.findLatest.mockResolvedValue({ id: "r1", number: 1, sourceKey: "r1-bundle" });
    mocks.readBundle.mockResolvedValue({ version: 1, files: [{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 1, assetKey: "old-a", previewKeys: [] }] });
    const response = await POST(request({ sources: new File(["next"], "poster.ai", { type: "application/postscript" }), previews: new File(["preview"], "poster.png", { type: "image/png" }), sourceFileIds: "file-a", sourcePreviewIndexes: "0" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putBundle.mock.calls[0][1].files[0].id).toBe("file-a");
  });

  it("rejects an explicit mapping for a file removed from the latest revision", async () => {
    mocks.findLatest.mockResolvedValue({ id: "r2", number: 2, sourceKey: "r2-bundle" });
    mocks.readBundle.mockResolvedValue({ version: 1, files: [{ id: "file-a", name: "poster.ai", mimeType: "application/postscript", size: 1, assetKey: "old-a", previewKeys: [] }] });
    const response = await POST(request({ sources: new File(["next"], "poster.ai", { type: "application/postscript" }), previews: new File(["preview"], "poster.png", { type: "image/png" }), sourceFileIds: "file-removed", sourcePreviewIndexes: "0" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(409);
    expect(mocks.createRevision).not.toHaveBeenCalled();
  });

  it("normalizes discovery metadata and computes an uploaded source checksum", async () => {
    const response = await POST(request({ tool: " Figma ", toolVersion: " 2025 ", tags: "UI, Mobile", source: new File(["source"], "source.zip", { type: "application/zip" }), previews: new File(["png"], "preview.png", { type: "image/png" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ license: "CC BY 4.0", tool: "figma", toolVersion: "2025", tags: ["ui", "mobile"], sourceChecksum: "b".repeat(64) }) }));
  });

  it("publishes an HTTP(S) source URL without a source key", async () => {
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip", previews: new File(["jpg"], "preview.jpg", { type: "image/jpeg" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceKey: undefined, sourceUrl: "https://example.com/design.zip", capabilityMode: "WHOLE_DOCUMENT", capabilityUnitCount: 0 }) }));
  });

  it("publishes an HTML preview through the same atomic pipeline", async () => {
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip", previews: new File(["<script>window.ran = true</script>"], "preview.html", { type: "text/html" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ previews: { create: [expect.objectContaining({ mimeType: "text/html" })] } }) }));
  });

  it("rejects executable preview types", async () => {
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip", previews: new File(["alert(1)"], "preview.js", { type: "text/javascript" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/PNG\/JPG\/HTML/i) });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it("ignores an empty optional source input when a source URL is provided", async () => {
    const response = await POST(request({ source: new File([], "", { type: "application/octet-stream" }), sourceUrl: "https://example.com/design.zip", previews: new File(["jpg"], "preview.jpg", { type: "image/jpeg" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceKey: undefined, sourceUrl: "https://example.com/design.zip" }) }));
  });

  it("persists preview positions for stable multi-preview pairing", async () => {
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip", previews: new File(["one"], "one.png", { type: "image/png" }), preview: new File(["two"], "two.png", { type: "image/png" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ previews: { create: expect.arrayContaining([expect.objectContaining({ position: 0 }), expect.objectContaining({ position: 1 })]) } }) }));
  });

  it("cleans staged objects and leaves the database untouched on partial upload failure", async () => {
    mocks.putObject.mockResolvedValueOnce("https://cdn/source").mockResolvedValueOnce("https://cdn/preview-0").mockRejectedValueOnce(new Error("storage down"));
    const response = await POST(request({ source: new File(["source"], "source.zip", { type: "application/zip" }), previews: new File(["one"], "one.png", { type: "image/png" }), preview: new File(["two"], "two.png", { type: "image/png" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteObject).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["title", { title: "" }],
    ["change description", { changeDescription: "   " }],
    ["preview alt text", { altTexts: "" }],
  ])("rejects an empty %s before uploading", async (_field, override) => {
    const response = await POST(request({ title: "Landing page update", changeDescription: "Updated the landing page layout", sourceUrl: "https://example.com/design.zip", previews: new File(["png"], "preview.png", { type: "image/png" }), ...override }, false), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/title|description|alt text/i) });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it("rejects a preview alt text count that does not match uploaded previews", async () => {
    const response = await POST(request({ title: "Landing page update", changeDescription: "Updated the landing page layout", sourceUrl: "https://example.com/design.zip", previews: new File(["one"], "one.png", { type: "image/png" }), preview: new File(["two"], "two.png", { type: "image/png" }), altTexts: "Only one description" }, false), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/one alt text/i) });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });
});
