import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), upsertStar: vi.fn(), deleteStars: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, projectStar: { upsert: mocks.upsertStar, deleteMany: mocks.deleteStars } } }));

const { PUT, DELETE } = await import("./route");

function request(method: "PUT" | "DELETE") {
  return new Request("http://localhost/api/projects/demo/star", { method });
}

const params = { params: Promise.resolve({ slug: "demo" }) };

describe("project star route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-a" } });
    mocks.findProject.mockResolvedValue({ id: "project", isPublic: true });
    mocks.upsertStar.mockResolvedValue({ userId: "user-a", projectId: "project" });
    mocks.deleteStars.mockResolvedValue({ count: 1 });
  });

  it.each(["PUT", "DELETE"] as const)("requires authentication for %s", async (method) => {
    mocks.getSession.mockResolvedValue(null);
    const response = await (method === "PUT" ? PUT(request(method), params) : DELETE(request(method), params));

    expect(response.status).toBe(401);
    expect(mocks.findProject).not.toHaveBeenCalled();
    expect(mocks.upsertStar).not.toHaveBeenCalled();
    expect(mocks.deleteStars).not.toHaveBeenCalled();
  });

  it("hides missing projects for PUT", async () => {
    mocks.findProject.mockResolvedValue(null);
    const response = await PUT(request("PUT"), params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Project not found" });
    expect(mocks.upsertStar).not.toHaveBeenCalled();
    expect(mocks.deleteStars).not.toHaveBeenCalled();
  });

  it("hides private projects for PUT", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", isPublic: false });
    const response = await PUT(request("PUT"), params);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Project not found" });
    expect(mocks.upsertStar).not.toHaveBeenCalled();
    expect(mocks.deleteStars).not.toHaveBeenCalled();
  });

  it.each(["public", "private", "missing"])("returns the same successful response for a %s DELETE", async () => {
    mocks.deleteStars.mockResolvedValue({ count: 0 });
    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ starred: false });
  });

  it("makes repeated PUTs idempotent", async () => {
    const first = await PUT(request("PUT"), params);
    const repeated = await PUT(request("PUT"), params);

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ starred: true });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({ starred: true });
    expect(mocks.upsertStar).toHaveBeenCalledTimes(2);
    expect(mocks.upsertStar).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "user-a", projectId: "project" } },
      create: { userId: "user-a", projectId: "project" },
      update: {},
    });
  });

  it("makes repeated DELETEs idempotent", async () => {
    mocks.deleteStars.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const first = await DELETE(request("DELETE"), params);
    const repeated = await DELETE(request("DELETE"), params);

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ starred: false });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({ starred: false });
  });

  it("deletes only the current user's Star", async () => {
    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(200);
    expect(mocks.deleteStars).toHaveBeenCalledWith({ where: { userId: "user-a", project: { slug: "demo" } } });
    expect(mocks.findProject).not.toHaveBeenCalled();
  });
});
