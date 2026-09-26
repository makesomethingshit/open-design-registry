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
    mocks.findBaseRevision.mockResolvedValue({ sourceKey: "base" });
    mocks.findSourceRevision.mockResolvedValue({ isPublished: true, sourceKey: "source", project: { ownerId: "contributor" } });
    mocks.readRevisionBundleStrict.mockResolvedValue({ files: [] });
    mocks.detectUnitChanges.mockReturnValue([{ action: "ADD_UNIT", sourceFileId: "unit", name: "Poster", kind: "artboard" }]);
  });

  it("returns server-derived changes only for the signed-in contributor's source revision", async () => {
    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ changes: [{ action: "ADD_UNIT", sourceFileId: "unit", name: "Poster", kind: "artboard" }], wholeDocument: true });
    expect(mocks.readRevisionBundleStrict).toHaveBeenCalledWith("base");
    expect(mocks.readRevisionBundleStrict).toHaveBeenCalledWith("source");
  });

  it("does not classify a structured base with no detected changes as whole-document", async () => {
    mocks.readRevisionBundleStrict.mockImplementation(async (key: string) => key === "base" ? { files: [{ id: "target" }] } : { files: [] });
    mocks.detectUnitChanges.mockReturnValue([]);

    const response = await GET(new Request("http://localhost/api/projects/target/contribute?baseRevisionId=base&sourceRevisionId=source"), { params: Promise.resolve({ slug: "target" }) });

    await expect(response.json()).resolves.toEqual({ changes: [], wholeDocument: false });
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
