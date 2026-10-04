import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), project: vi.fn(), putObject: vi.fn() }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.project } } }));
vi.mock("@/src/lib/storage", () => ({ putObject: mocks.putObject }));
const { POST } = await import("./route");
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
function request(bytes = png, type = "image/png", headers?: HeadersInit) {
  const form = new FormData(); form.set("image", new File([bytes], "design.png", { type }));
  return new Request("http://localhost/api/projects/demo/document-images", { method: "POST", body: form, headers });
}
const context = { params: Promise.resolve({ slug: "demo" }) };
describe("document image uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.project.mockResolvedValue({ id: "project1", ownerId: "owner" });
    mocks.putObject.mockImplementation((_: File, key: string) => Promise.resolve(`/api/assets?key=${encodeURIComponent(key)}`));
  });
  it("requires the project owner before accepting a file", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(401);
    mocks.session.mockResolvedValue({ user: { id: "visitor" } });
    expect((await POST(request(), context)).status).toBe(404);
    mocks.project.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.putObject).not.toHaveBeenCalled();
  });
  it("stores valid images under the database project's ID and returns the proxy URL", async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    const key = mocks.putObject.mock.calls[0][1] as string;
    expect(key).toMatch(/^project-documents\/project1\/[0-9a-f-]{36}\.png$/);
    expect((await response.json()).url).toBe(`/api/assets?key=${encodeURIComponent(key)}`);
    expect(mocks.project).toHaveBeenCalledWith({ where: { slug: "demo" }, select: { id: true, ownerId: true } });
  });
  it("rejects mislabeled HTML, unsupported types, and oversized requests", async () => {
    expect((await POST(request(new TextEncoder().encode("<script>x</script>")), context)).status).toBe(400);
    expect((await POST(request(png, "image/svg+xml"), context)).status).toBe(400);
    expect((await POST(request(png, "image/png", { "content-length": String(11 * 1024 * 1024) }), context)).status).toBe(400);
    expect(mocks.putObject).not.toHaveBeenCalled();
  });
  it("reports a storage failure without claiming the image was uploaded", async () => {
    mocks.putObject.mockRejectedValue(new Error("Storage unavailable"));
    expect((await POST(request(), context)).status).toBe(500);
  });
});
