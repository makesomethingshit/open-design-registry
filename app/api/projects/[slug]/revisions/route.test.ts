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
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.findProject },
  $transaction: mocks.transaction,
} }));
vi.mock("@/src/lib/storage", () => ({ putObject: mocks.putObject, deleteObject: mocks.deleteObject }));

const { POST } = await import("./route");

function request(fields: Record<string, string | File>, metadata = true) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  if (metadata) {
    form.append("title", "Landing page update");
    form.append("changeDescription", "Updated the landing page layout");
    const previewCount = Object.keys(fields).filter((key) => key === "previews" || key === "preview").length;
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
      $queryRaw: vi.fn(),
      revision: { findFirst: mocks.findLatest, create: mocks.createRevision, update: mocks.updateRevision },
    }));
    mocks.putObject.mockImplementation(async (_file: File, key: string) => `https://cdn/${key}`);
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

  it("normalizes discovery metadata and computes an uploaded source checksum", async () => {
    const response = await POST(request({ tool: " Figma ", toolVersion: " 2025 ", tags: "UI, Mobile", source: new File(["source"], "source.zip", { type: "application/zip" }), previews: new File(["png"], "preview.png", { type: "image/png" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tool: "figma", toolVersion: "2025", tags: ["ui", "mobile"], sourceChecksum: "41cf6794ba4200b839c53531555f0f3998df4cbb01a4d5cb0b94e3ca5e23947d" }) }));
  });

  it("publishes an HTTP(S) source URL without a source key", async () => {
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip", previews: new File(["jpg"], "preview.jpg", { type: "image/jpeg" }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceKey: undefined, sourceUrl: "https://example.com/design.zip" }) }));
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
