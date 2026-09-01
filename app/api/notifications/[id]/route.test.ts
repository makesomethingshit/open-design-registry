import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findFirst: vi.fn(), update: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { notification: { findFirst: mocks.findFirst, update: mocks.update } } }));

const { PATCH } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/notifications/notification-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("notification read route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findFirst.mockResolvedValue({ id: "notification-1" });
    mocks.update.mockResolvedValue({ id: "notification-1", readAt: new Date("2026-09-01T00:00:00Z") });
  });

  it("requires authentication", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request({ read: true }), { params: Promise.resolve({ id: "notification-1" }) });
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("does not allow reading another user's notification", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await PATCH(request({ read: true }), { params: Promise.resolve({ id: "notification-1" }) });
    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: "notification-1", recipientId: "owner" }, select: { id: true } });
  });

  it("marks an owned notification as read", async () => {
    const response = await PATCH(request({ read: true }), { params: Promise.resolve({ id: "notification-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "notification-1" });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "notification-1" }, data: { readAt: expect.any(Date) } }));
  });
});
