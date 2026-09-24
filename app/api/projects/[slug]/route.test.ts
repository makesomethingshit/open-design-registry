import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findProject: vi.fn(), updateProject: vi.fn(), getSession: vi.fn() }));

vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject, update: mocks.updateProject } } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));

const { PATCH } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/projects/demo", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("project settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({ slug: "demo", ownerId: "owner", isPublic: true });
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.updateProject.mockResolvedValue({ activityStatus: "PAUSED", coverUrl: "cover.png" });
  });

  it("lets the owner update the descriptive activity status", async () => {
    const response = await PATCH(request({ activityStatus: "PAUSED" }), { params: Promise.resolve({ slug: "demo" }) });

    expect(response.status).toBe(200);
    expect((await response.json()).activityStatus).toBe("PAUSED");
    expect(mocks.updateProject).toHaveBeenCalledWith({ where: { slug: "demo" }, data: { activityStatus: "PAUSED" } });
  });

  it.each(["COMPLETED", "paused"])("rejects invalid activity status %s", async (activityStatus) => {
    const response = await PATCH(request({ activityStatus }), { params: Promise.resolve({ slug: "demo" }) });

    expect(response.status).toBe(400);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });
});
