import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { notification: { findMany: mocks.findMany, count: mocks.count } } }));

const { GET } = await import("./route");

describe("notification list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findMany.mockResolvedValue([{ id: "notification", type: "ISSUE_CREATED", readAt: null, createdAt: new Date("2026-09-01T00:00:00Z"), actor: { name: "Reporter" }, project: { slug: "demo", title: "Design" }, issue: { id: "issue", title: "Broken component" }, forkedProject: null }]);
    mocks.count.mockResolvedValue(1);
  });

  it("requires authentication", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns only the signed-in user's newest notifications and unread count", async () => {
    const response = await GET(new Request("http://localhost/api/notifications"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unreadCount: 1, notifications: [{ id: "notification", type: "ISSUE_CREATED" }] });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ recipientId: "owner", OR: expect.any(Array) }), orderBy: { createdAt: "desc" }, take: 50 }));
    expect(mocks.count).toHaveBeenCalledWith({ where: expect.objectContaining({ recipientId: "owner", readAt: null, OR: expect.any(Array) }) });
  });
});
