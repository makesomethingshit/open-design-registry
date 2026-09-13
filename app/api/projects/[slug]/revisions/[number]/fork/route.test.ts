import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), createProject: vi.fn(), createRevision: vi.fn(), publishRevision: vi.fn(), createNotification: vi.fn(), transaction: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
const { POST } = await import("./route");
const preview = { position: 0, key: "revisions/source/preview.png", url: "/api/assets?key=revisions/source/preview.png", mimeType: "image/png", size: 12, altText: "Design preview" };
const revision = { id: "revision", number: 2, title: "Original", license: "CC BY 4.0", sourceKey: "revisions/source/design.zip", sourceUrl: null, tool: "penpot", toolVersion: "2", tags: ["poster"], sourceChecksum: "a".repeat(64), capabilityMode: "STRUCTURED", capabilityUnitCount: 2, adapterId: "svg", adapterVersion: "0.4", adapterConfidence: "LOW", adapterMaturity: "beta", previews: [preview] };
const source = { id: "project", slug: "demo", title: "Design", description: "Notes", license: "MIT", coverUrl: "/api/assets?key=cover", isPublic: true, ownerId: "owner", revisions: [revision] };
function request(rightsConfirmed: unknown = true) {
  return new Request("http://localhost/api/projects/demo/revisions/2/fork", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Fork", rightsConfirmed }) });
}
const params = { params: Promise.resolve({ slug: "demo", number: "2" }) };

describe("revision fork route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "forker" } });
    mocks.findProject.mockResolvedValue(source);
    mocks.createProject.mockResolvedValue({ id: "fork", slug: "design-fork", coverUrl: source.coverUrl });
    mocks.createRevision.mockResolvedValue({ id: "fork-revision" });
    mocks.transaction.mockImplementation(async (fn) => fn({
      $queryRaw: vi.fn(), project: { findUnique: mocks.findProject, create: mocks.createProject },
      revision: { create: mocks.createRevision, update: mocks.publishRevision }, notification: { create: mocks.createNotification },
    }));
  });

  it.each([false, null])("rejects missing or false rights confirmation (%s)", async (value) => {
    expect((await POST(request(value), params)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("requires sign-in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request(), params)).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([{ ...source, isPublic: false }, { ...source, revisions: [] }, null])("rejects an unavailable published source", async (value) => {
    mocks.findProject.mockResolvedValue(value);
    expect((await POST(request(), params)).status).toBe(404);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
  it("publishes an independent first revision with the historical license and source assets", async () => {
    expect((await POST(request(), params)).status).toBe(201);
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ revisions: expect.objectContaining({ where: { number: 2, isPublished: true } }) }) }));
    expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ license: "CC BY 4.0", forkedFromLicense: "CC BY 4.0", forkedFromRevisionId: "revision" }) }));
    expect(mocks.createRevision).toHaveBeenCalledWith({ data: {
      projectId: "fork", number: 1, title: "Original", changeDescription: "Forked from Revision 2 of demo",
      license: "CC BY 4.0", sourceKey: revision.sourceKey, sourceUrl: null,
      tool: "penpot", toolVersion: "2", tags: ["poster"], sourceChecksum: revision.sourceChecksum,
      capabilityMode: "STRUCTURED", capabilityUnitCount: 2, adapterId: "svg", adapterVersion: "0.4", adapterConfidence: "LOW", adapterMaturity: "beta",
      isPublished: false, previews: { create: [preview] },
    } });
    expect(mocks.publishRevision).toHaveBeenCalledWith({ where: { id: "fork-revision" }, data: { isPublished: true } });
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: { recipientId: "owner", actorId: "forker", type: "FORK_CREATED", projectId: "project", forkedProjectId: "fork" } });
  });
  it("retains external source links without inventing a storage key", async () => {
    mocks.findProject.mockResolvedValue({ ...source, revisions: [{ ...revision, sourceKey: null, sourceUrl: "https://example.test/design.zip" }] });
    expect((await POST(request(), params)).status).toBe(201);
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceKey: null, sourceUrl: "https://example.test/design.zip" }) }));
  });
  it("does not mislabel a legacy revision's unknown license as historical fact", async () => {
    mocks.findProject.mockResolvedValue({ ...source, revisions: [{ ...revision, license: null }] });
    expect((await POST(request(), params)).status).toBe(201);
    expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ license: "MIT", forkedFromLicense: null }) }));
    expect(mocks.createRevision).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ license: "MIT" }) }));
  });
  it("does not notify the owner about their own fork", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    expect((await POST(request(), params)).status).toBe(201);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
  it("propagates notification failure out of the transaction so the fork rolls back", async () => {
    mocks.createNotification.mockRejectedValue(new Error("notification unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await POST(request(), params)).status).toBe(500);
      await expect(mocks.transaction.mock.results[0].value).rejects.toThrow("notification unavailable");
    } finally { log.mockRestore(); }
  });
});
