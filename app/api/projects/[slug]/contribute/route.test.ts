import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findBaseRevision: vi.fn(),
  findSourceRevision: vi.fn(),
  readRevisionBundleStrict: vi.fn(),
  detectUnitChanges: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findBaseRevision, findUnique: mocks.findSourceRevision } } }));
vi.mock("@/src/lib/revision-bundle", () => ({ detectUnitChanges: mocks.detectUnitChanges, readRevisionBundleStrict: mocks.readRevisionBundleStrict }));

const { GET } = await import("./route");

describe("contribution changes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "contributor" } });
    mocks.findProject.mockResolvedValue({ id: "target", isPublic: true, ownerId: "owner" });
    mocks.findBaseRevision.mockResolvedValue({ sourceKey: "base", sourceUrl: null, capabilityMode: null });
    mocks.findSourceRevision.mockResolvedValue({ isPublished: true, sourceKey: "source", sourceUrl: null, capabilityMode: null, project: { ownerId: "contributor" } });
    mocks.readRevisionBundleStrict.mockResolvedValue({ files: [] });
    mocks.detectUnitChanges.mockReturnValue([{ action: "ADD_UNIT", sourceFileId: "unit", name: "Poster", kind: "artboard" }]);
  });

  it("returns server-derived changes only for the signed-in contributor's source revision", async () => {
    mocks.readRevisionBundleStrict.mockImplementation(async (key: string) => ({ files: [{ id: key }] }));
    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ changes: [{ action: "ADD_UNIT", sourceFileId: "unit", name: "Poster", kind: "artboard" }], wholeDocument: false, capabilityMode: "STRUCTURED", capabilityUnitCount: 1 });
    expect(mocks.readRevisionBundleStrict).toHaveBeenCalledWith("base");
    expect(mocks.readRevisionBundleStrict).toHaveBeenCalledWith("source");
  });

  it("does not classify two structured revisions with no detected changes as whole-document", async () => {
    mocks.readRevisionBundleStrict.mockImplementation(async (key: string) => key === "base" ? { files: [{ id: "target" }] } : { files: [{ id: "source" }] });
    mocks.detectUnitChanges.mockReturnValue([]);

    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    await expect(response.json()).resolves.toEqual({ changes: [], wholeDocument: false, capabilityMode: "STRUCTURED", capabilityUnitCount: 1 });
  });

  it("offers whole-document preparation for a structured base and URL-only source", async () => {
    mocks.findSourceRevision.mockResolvedValue({ isPublished: true, sourceKey: null, sourceUrl: "https://example.test/source.zip", capabilityMode: "WHOLE_DOCUMENT", project: { ownerId: "contributor" } });
    mocks.readRevisionBundleStrict.mockImplementation(async (key: string | null) => key === "base" ? { files: [{ id: "target" }] } : null);
    mocks.detectUnitChanges.mockReturnValue([]);

    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ changes: [], wholeDocument: true, capabilityMode: "WHOLE_DOCUMENT", capabilityUnitCount: null });
    expect(mocks.readRevisionBundleStrict).toHaveBeenCalledWith("base");
    expect(mocks.readRevisionBundleStrict).toHaveBeenCalledWith(null);
  });

  it("marks missing legacy capability metadata unknown without blocking whole-document preparation", async () => {
    mocks.findBaseRevision.mockResolvedValue({ sourceKey: null, sourceUrl: null, capabilityMode: null });
    mocks.findSourceRevision.mockResolvedValue({ isPublished: true, sourceKey: null, sourceUrl: null, capabilityMode: null, project: { ownerId: "contributor" } });
    mocks.readRevisionBundleStrict.mockResolvedValue(null);
    mocks.detectUnitChanges.mockReturnValue([]);

    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    await expect(response.json()).resolves.toEqual({ changes: [], wholeDocument: true, capabilityMode: "UNKNOWN", capabilityUnitCount: null });
  });

  it("does not expose another contributor's source revision", async () => {
    mocks.findSourceRevision.mockResolvedValue({ isPublished: true, sourceKey: "source", project: { ownerId: "someone-else" } });

    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(400);
    expect(mocks.readRevisionBundleStrict).not.toHaveBeenCalled();
  });

  it("returns a retryable error when a bundle cannot be read", async () => {
    mocks.readRevisionBundleStrict.mockRejectedValue(new Error("storage unavailable"));

    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not load available changes." });
  });
});
