import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findRevision: vi.fn(),
  findDeclaration: vi.fn(),
  createDeclaration: vi.fn(),
  transaction: vi.fn(),
  readBundle: vi.fn(),
  deletedImage: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.findProject },
  revision: { findUnique: mocks.findRevision },
  revisionRightsDeclaration: { findFirst: mocks.findDeclaration },
  $transaction: mocks.transaction,
} }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle }));

const { GET, POST, PATCH } = await import("./route");

function request(body?: unknown, method = "POST") {
  return new Request("http://localhost/api/projects/demo/revisions/1/rights", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ slug: "demo", number: "1" }) };

describe("revision rights API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findRevision.mockResolvedValue({ id: "revision", sourceKey: "bundle", isPublished: true, license: "CC BY 4.0" });
    mocks.findDeclaration.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue({ version: 2, files: [{ id: "file-1" }] });
    mocks.createDeclaration.mockImplementation(async ({ data, include }: { data: unknown; include: unknown }) => ({ id: "declaration-1", version: 1, ...(data as object), include }));
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: vi.fn().mockResolvedValue([{ id: "revision" }]),
      revisionRightsDeclaration: { findFirst: mocks.findDeclaration, create: mocks.createDeclaration },
      documentImageDeletion: { findFirst: mocks.deletedImage },
    }));
  });

  it("returns the latest declaration and preserves legacy null", async () => {
    const response = (await GET(request(undefined, "GET"), params))!;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ revisionId: "revision", revisionLicense: "CC BY 4.0", declaration: null });
  });
  it("returns a recoverable 409 instead of saving a marked rights URL", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://local");
    mocks.deletedImage.mockResolvedValueOnce({ key: "expired" });
    const key = "project-documents/p/00000000-0000-4000-8000-000000000001.png";
    const response = await POST(request({ sourceRightsMode: "UNKNOWN", items: [{ type: "IMAGE", name: "Expired", licenseUrl: `http://local/api/assets?key=${encodeURIComponent(key)}` }] }), params);
    expect(response!.status).toBe(409); expect(mocks.createDeclaration).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("stores explicit same-as-revision, unknown, restricted, and external declarations", async () => {
    const response = (await POST(request({
      sourceRightsMode: "SAME_AS_REVISION",
      items: [
        { type: "SOURCE_FILE", name: "Poster.ai", sourceFileId: "file-1", redistribution: "UNKNOWN", derivativeUse: "UNKNOWN" },
        { type: "FONT", name: "Neue Haas Grotesk", redistribution: "NOT_ALLOWED", derivativeUse: "RESTRICTED" },
      ],
    }), params))!;
    expect(response.status).toBe(201);
    expect(mocks.createDeclaration).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceRightsMode: "SAME_AS_REVISION", version: 1, items: { create: expect.arrayContaining([expect.objectContaining({ sourceFileId: "file-1", redistribution: "UNKNOWN" }), expect.objectContaining({ name: "Neue Haas Grotesk", derivativeUse: "RESTRICTED" })]) } }) }));
  });

  it("accepts a schema-valid rights declaration above 1 MiB", async () => {
    const longUrl = "https://example.com/" + "a".repeat(2000);
    const items = Array.from({ length: 100 }, () => ({
      type: "IMAGE",
      name: "가".repeat(200),
      rightsHolder: "나".repeat(200),
      licenseName: "다".repeat(200),
      licenseUrl: longUrl,
      sourceUrl: longUrl,
      redistribution: "UNKNOWN",
      derivativeUse: "UNKNOWN",
      notes: "라".repeat(2000),
    }));
    const body = { sourceRightsMode: "UNKNOWN", items };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(1024 * 1024);
    const response = (await POST(request(body), params))!;
    expect(response.status).toBe(201);
    expect(mocks.createDeclaration).toHaveBeenCalledOnce();
  });

  it("rejects same-as-revision when the revision has no recorded license before opening a transaction", async () => {
    mocks.findRevision.mockResolvedValue({ id: "revision", sourceKey: "bundle", isPublished: true, license: null });
    const response = (await POST(request({ sourceRightsMode: "SAME_AS_REVISION", items: [] }), params))!;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("no recorded license") });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createDeclaration).not.toHaveBeenCalled();
  });

  it("allows unknown and separate rights on a legacy revision", async () => {
    mocks.findRevision.mockResolvedValue({ id: "revision", sourceKey: "bundle", isPublished: true, license: null });
    expect((await POST(request({ sourceRightsMode: "UNKNOWN", sourceRightsHolder: "Studio", items: [] }), params))!.status).toBe(201);
    mocks.findRevision.mockResolvedValue({ id: "revision", sourceKey: "bundle", isPublished: true, license: null });
    expect((await POST(request({ sourceRightsMode: "SEPARATE", sourceLicenseName: "Studio License", items: [] }), params))!.status).toBe(201);
  });

  it("allows same-as-revision when the revision has a recorded license", async () => {
    mocks.findRevision.mockResolvedValue({ id: "revision", sourceKey: "bundle", isPublished: true, license: "MIT" });
    expect((await POST(request({ sourceRightsMode: "SAME_AS_REVISION", items: [] }), params))!.status).toBe(201);
  });

  it("rejects an unknown bundle file before writing", async () => {
    const response = (await POST(request({ sourceRightsMode: "UNKNOWN", items: [{ type: "IMAGE", name: "Hero", sourceFileId: "missing" }] }), params))!;
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("enforces owner-only mutation and keeps updates append-only", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request({ sourceRightsMode: "UNKNOWN" }), params))!.status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ user: { id: "other" } });
    expect((await POST(request({ sourceRightsMode: "UNKNOWN" }), params))!.status).toBe(403);
    mocks.findDeclaration.mockResolvedValueOnce({ id: "v1", version: 1 });
    mocks.createDeclaration.mockResolvedValueOnce({ id: "v2", version: 2 });
    const response = (await PATCH(request({ sourceRightsMode: "UNKNOWN", notes: "Corrected" }, "PATCH"), params))!;
    expect(response.status).toBe(201);
    expect(mocks.createDeclaration).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 2, supersedesId: "v1" }) }));
  });

  it("keeps private manifests behind the existing project visibility boundary", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: false });
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const response = (await GET(request(undefined, "GET"), params))!;
    expect(response.status).toBe(404);
    expect(mocks.findRevision).not.toHaveBeenCalled();
    expect(mocks.findDeclaration).not.toHaveBeenCalled();
  });
});
