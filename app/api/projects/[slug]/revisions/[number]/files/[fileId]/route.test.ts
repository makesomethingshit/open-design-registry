import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findRevision: vi.fn(), readBundle: vi.fn(), getObject: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findUnique: mocks.findRevision } } }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle, sanitizeUnitName: (value: string) => value.trim().replace(/[\\/\"\u0000-\u001f\u007f]/g, "-").trim() }));
vi.mock("@/src/lib/storage", () => ({ getObject: mocks.getObject }));

const { GET } = await import("./route");
const params = { params: Promise.resolve({ slug: "demo", number: "2", fileId: "file-a" }) };

function request() {
  return new Request("http://localhost/api/projects/demo/revisions/2/files/file-a");
}

describe("revision source file download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findRevision.mockResolvedValue({ isPublished: true, sourceKey: "bundle" });
    mocks.readBundle.mockResolvedValue({ version: 1, files: [{ id: "file-a", name: "original.ai", mimeType: "application/postscript", size: 14, assetKey: "private/original.ai", previewKeys: [] }] });
    mocks.getObject.mockResolvedValue({ Body: new Blob(["original bytes"]).stream(), ContentType: "application/postscript", ContentLength: 14 });
  });

  it.each([
    ["public visitor", { id: "project", ownerId: "owner", isPublic: true }, null],
    ["private owner", { id: "project", ownerId: "owner", isPublic: false }, { user: { id: "owner" } }],
  ])("streams the exact original bytes for a %s", async (_name, project, session) => {
    mocks.findProject.mockResolvedValue(project);
    mocks.getSession.mockResolvedValue(session);
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("original bytes");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe("attachment; filename=\"source-file\"; filename*=UTF-8''original.ai");
  });

  it.each([
    ["Korean", "포스터.psd", "%ED%8F%AC%EC%8A%A4%ED%84%B0.psd"],
    ["emoji", "poster-😀.psd", "poster-%F0%9F%98%80.psd"],
    ["quotes and path separators", "../'\"source\"\\poster😀.psd", "..-%27-source--poster%F0%9F%98%80.psd"],
  ])("streams %s names with a safe RFC 5987 header", async (_case, name, encodedName) => {
    mocks.readBundle.mockResolvedValue({ version: 1, files: [{ id: "file-a", name, mimeType: "application/postscript", size: 14, assetKey: "private/original.ai", previewKeys: [] }] });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("original bytes");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="source-file"; filename*=UTF-8''${encodedName}`);
  });

  it("does not reveal a private revision file to a non-owner", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: false });
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const response = await GET(request(), params);
    expect(response.status).toBe(404);
    expect(mocks.readBundle).not.toHaveBeenCalled();
    expect(mocks.getObject).not.toHaveBeenCalled();
  });
});
