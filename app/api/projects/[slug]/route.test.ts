import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject, update: mocks.updateProject } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { PATCH } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/projects/demo", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ slug: "demo", ownerId: "owner", isPublic: true });
    mocks.updateProject.mockResolvedValue({ slug: "demo", activityStatus: "PAUSED", coverUrl: "cover" });
  });

  it("lets the owner update activity status", async () => {
    const response = await PATCH(request({ activityStatus: "PAUSED" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(200);
    expect(mocks.updateProject).toHaveBeenCalledWith({ where: { slug: "demo" }, data: { activityStatus: "PAUSED" } });
    expect(await response.json()).toMatchObject({ activityStatus: "PAUSED" });
  });

  it("keeps project settings owner-only", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    const response = await PATCH(request({ activityStatus: "ARCHIVED" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(403);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });
});
