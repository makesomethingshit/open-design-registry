import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), upsertWatch: vi.fn(), deleteWatches: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, projectWatch: { upsert: mocks.upsertWatch, deleteMany: mocks.deleteWatches } } }));

const { PUT, DELETE } = await import("./route");

function request(method: "PUT" | "DELETE") {
  return new Request("http://localhost/api/projects/demo/watch", { method });
}

const params = { params: Promise.resolve({ slug: "demo" }) };

describe("project watch route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-a" } });
    mocks.findProject.mockResolvedValue({ id: "project", isPublic: true });
    mocks.upsertWatch.mockResolvedValue({ userId: "user-a", projectId: "project" });
    mocks.deleteWatches.mockResolvedValue({ count: 1 });
  });

  it.each(["PUT", "DELETE"] as const)("requires authentication for %s", async (method) => {
    mocks.getSession.mockResolvedValue(null);
    const response = await (method === "PUT" ? PUT(request(method), params) : DELETE(request(method), params));

    expect(response.status).toBe(401);
    expect(mocks.findProject).not.toHaveBeenCalled();
    expect(mocks.upsertWatch).not.toHaveBeenCalled();
    expect(mocks.deleteWatches).not.toHaveBeenCalled();
  });

  it.each(["PUT", "DELETE"] as const)("hides missing projects for %s", async (method) => {
    mocks.findProject.mockResolvedValue(null);
    const response = await (method === "PUT" ? PUT(request(method), params) : DELETE(request(method), params));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Project not found" });
    expect(mocks.upsertWatch).not.toHaveBeenCalled();
    expect(mocks.deleteWatches).not.toHaveBeenCalled();
  });

  it.each(["PUT", "DELETE"] as const)("hides private projects for %s", async (method) => {
    mocks.findProject.mockResolvedValue({ id: "project", isPublic: false });
    const response = await (method === "PUT" ? PUT(request(method), params) : DELETE(request(method), params));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Project not found" });
    expect(mocks.upsertWatch).not.toHaveBeenCalled();
    expect(mocks.deleteWatches).not.toHaveBeenCalled();
  });

  it("makes repeated PUTs idempotent", async () => {
    const first = await PUT(request("PUT"), params);
    const repeated = await PUT(request("PUT"), params);

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ watched: true });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({ watched: true });
    expect(mocks.upsertWatch).toHaveBeenCalledTimes(2);
    expect(mocks.upsertWatch).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "user-a", projectId: "project" } },
      create: { userId: "user-a", projectId: "project" },
      update: {},
    });
  });

  it("makes repeated DELETEs idempotent", async () => {
    mocks.deleteWatches.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const first = await DELETE(request("DELETE"), params);
    const repeated = await DELETE(request("DELETE"), params);

    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ watched: false });
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({ watched: false });
  });

  it("deletes only the current user's Watch", async () => {
    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(200);
    expect(mocks.deleteWatches).toHaveBeenCalledWith({ where: { userId: "user-a", projectId: "project" } });
  });

  it("does not touch the Star relation", async () => {
    await PUT(request("PUT"), params);
    await DELETE(request("DELETE"), params);

    expect(mocks.upsertWatch).toHaveBeenCalled();
    expect(mocks.deleteWatches).toHaveBeenCalled();
  });
});
