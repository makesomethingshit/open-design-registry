import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findIssue: vi.fn(), updateIssue: vi.fn(), deleteParticipations: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    issue: { findUnique: mocks.findIssue, update: mocks.updateIssue },
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: async () => [{ id: "issue-1" }],
        issue: { findUnique: mocks.findIssue, update: mocks.updateIssue },
        designRequestParticipation: { deleteMany: mocks.deleteParticipations },
      }),
  },
}));

const { GET, PATCH } = await import("./route");
const context = { params: Promise.resolve({ id: "issue-1" }) };

function request(method = "GET", body?: unknown) {
  return new Request("http://localhost/api/issues/issue-1", {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("issue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findIssue.mockResolvedValue({ id: "issue-1", status: "OPEN", project: { ownerId: "owner", isPublic: false } });
    mocks.updateIssue.mockResolvedValue({ id: "issue-1", status: "CLOSED" });
    mocks.deleteParticipations.mockResolvedValue({ count: 0 });
  });

  it("does not expose a private issue to another user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "other" } });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
  });

  it("validates status changes before writing", async () => {
    const response = await PATCH(request("PATCH", { status: "DELETED" }), context);
    expect(response.status).toBe(400);
    expect(mocks.updateIssue).not.toHaveBeenCalled();
  });

  it("records who closed an issue", async () => {
    const response = await PATCH(request("PATCH", { status: "CLOSED" }), context);
    expect(response.status).toBe(200);
    expect(mocks.updateIssue).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "issue-1" },
      data: { status: "CLOSED", closedAt: expect.any(Date), closedBy: "owner" },
    }));
  });
});
