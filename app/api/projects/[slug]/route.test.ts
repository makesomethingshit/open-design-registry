import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  lock: vi.fn(),
  holdFindUnique: vi.fn(),
  holdUpdate: vi.fn(),
  validateDocumentImages: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.findUnique, update: mocks.update },
    $transaction: (run: (tx: unknown) => unknown) => run({
      $queryRaw: mocks.lock,
      project: { update: mocks.update },
      moderationProjectHold: { findUnique: mocks.holdFindUnique, update: mocks.holdUpdate },
    }),
  },
}));
vi.mock("@/src/lib/project-document-save", () => ({ validateDocumentImages: mocks.validateDocumentImages, imageReferenceTransactionOptions: { timeout: 60000 } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { GET, PATCH } = await import("./route");

const params = { slug: "demo" };
function patchRequest(body: unknown) {
  return new Request("http://localhost/api/projects/demo", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function storedProject(overrides = {}) {
  return {
    id: "project",
    slug: "demo",
    title: "Demo",
    description: "Short",
    document: "",
    license: "MIT",
    coverUrl: "covers/demo",
    ownerId: "owner",
    isPublic: true,
    ...overrides,
  };
}

describe("project document save and read permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(storedProject());
    mocks.validateDocumentImages.mockResolvedValue(true);
    mocks.lock.mockResolvedValue([]);
    mocks.holdFindUnique.mockResolvedValue(null);
    mocks.holdUpdate.mockResolvedValue({ active: true, wasPublic: false });
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...storedProject(),
      ...data,
    }));
  });

  it("lets the owner save the document", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await PATCH(patchRequest({ document: "# Hello" }), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ document: "# Hello" }) }),
    );
    expect(await response.json()).toMatchObject({ document: "# Hello", description: "Short" });
  });

  it("rejects unauthenticated saves", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(patchRequest({ document: "# Hello" }), { params: Promise.resolve(params) });
    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a draft whose image expired instead of saving a broken reference", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.validateDocumentImages.mockResolvedValue(false);
    const response = await PATCH(patchRequest({ document: "![draft](/api/assets?key=expired)" }), { params: Promise.resolve(params) });
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("preserves storage errors instead of claiming the document was saved", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.validateDocumentImages.mockRejectedValue(new Error("Storage unavailable"));
    await expect(PATCH(patchRequest({ document: "# draft" }), { params: Promise.resolve(params) })).rejects.toThrow("Storage unavailable");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects non-owner saves on public projects", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    const response = await PATCH(patchRequest({ document: "# Hello" }), { params: Promise.resolve(params) });
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("hides private projects from non-owner saves", async () => {
    mocks.findUnique.mockResolvedValue(storedProject({ isPublic: false }));
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    const response = await PATCH(patchRequest({ document: "# Hello" }), { params: Promise.resolve(params) });
    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects over-length documents", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await PATCH(patchRequest({ document: "x".repeat(50001) }), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("serves the document with the project to allowed readers only", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.findUnique.mockResolvedValue(storedProject({ document: "# Hello" }));
    const response = await GET(new Request("http://localhost/api/projects/demo"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ document: "# Hello" });

    mocks.findUnique.mockResolvedValue(storedProject({ isPublic: false, document: "# Hello" }));
    const hidden = await GET(new Request("http://localhost/api/projects/demo"), {
      params: Promise.resolve(params),
    });
    expect(hidden.status).toBe(404);
  });
  it("prevents owners from republishing an active moderation hold", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findUnique.mockResolvedValue(storedProject({ isPublic: false }));
    mocks.holdFindUnique.mockResolvedValue({ active: true, wasPublic: true });
    const response = await PATCH(patchRequest({ isPublic: true, rightsConfirmed: true }), { params: Promise.resolve(params) });
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("remembers an owner's explicit private choice during a moderation hold", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.holdFindUnique.mockResolvedValue({ active: true, wasPublic: true });
    const response = await PATCH(patchRequest({ isPublic: false }), { params: Promise.resolve(params) });
    expect(response.status).toBe(200);
    expect(mocks.holdUpdate).toHaveBeenCalledWith({
      where: { projectId: "project" }, data: { wasPublic: false },
    });
  });

});
