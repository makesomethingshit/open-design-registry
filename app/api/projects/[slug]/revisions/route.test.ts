import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  transaction: vi.fn(),
  createRevision: vi.fn(),
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

function request(fields: Record<string, string | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request("http://localhost/projects/demo/revisions", { method: "POST", body: form });
}

describe("revision publishing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner" });
    mocks.findLatest.mockResolvedValue(undefined);
    mocks.createRevision.mockResolvedValue({ id: "revision", number: 1, previews: [] });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn(),
      revision: { findFirst: mocks.findLatest, create: mocks.createRevision },
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
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceUrl: undefined, sourceKey: expect.stringMatching(/^revisions\/project\//) }) }));
  });

  it("publishes an HTTP(S) source URL without a source key", async () => {
    const response = await POST(request({ sourceUrl: "https://example.com/design.zip", previews: new File(["jpg"], "preview.jpg", { type: "image/jpeg" }) }), { params: Promise.resolve({ slug: "demo" }) });
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
});
