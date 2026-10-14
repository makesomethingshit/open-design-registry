import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findDiscussions: vi.fn(),
  createDiscussion: vi.fn(),
  createNotification: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.findProject },
  discussion: { findMany: mocks.findDiscussions },
  $transaction: mocks.transaction,
} }));

const { GET, POST } = await import("./route");

function request(method: "GET" | "POST", body?: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/demo/discussions", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("project discussions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "reporter" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findDiscussions.mockResolvedValue([{ id: "discussion", title: "Navigation", createdAt: new Date(), author: { name: "Reporter" }, _count: { comments: 2 } }]);
    mocks.createDiscussion.mockResolvedValue({ id: "discussion", title: "Navigation", body: "Details", author: { name: "Reporter" } });
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: async () => [{ id: "project" }], project: { findUnique: mocks.findProject }, discussion: { create: mocks.createDiscussion }, notification: { create: mocks.createNotification } } as never));
  });

  it.each([
    ["anonymous public", true, null, 200],
    ["anonymous private", false, null, 404],
    ["non-owner private", false, { user: { id: "visitor" } }, 404],
    ["private owner", false, { user: { id: "owner" } }, 200],
  ])("applies project visibility for %s", async (_label, isPublic, session, status) => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic });
    mocks.getSession.mockResolvedValue(session);
    const response = await GET(request("GET"), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(status);
    if (status === 200) {
      expect(await response.json()).toMatchObject([{ id: "discussion", title: "Navigation", author: { name: "Reporter" }, _count: { comments: 2 } }]);
      expect(mocks.findDiscussions).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { createdAt: "desc" }, select: expect.objectContaining({ _count: { select: { comments: true } } }) }));
    } else expect(mocks.findDiscussions).not.toHaveBeenCalled();
  });

  it("requires a signed-in user to create a discussion", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("POST", { title: "Navigation", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a public-project discussion and notifies its owner", async () => {
    const response = await POST(request("POST", { title: " Navigation ", body: " Details " }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createDiscussion).toHaveBeenCalledWith(expect.objectContaining({ data: { projectId: "project", authorId: "reporter", title: "Navigation", body: "Details" } }));
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: { recipientId: "owner", actorId: "reporter", type: "DISCUSSION_CREATED", projectId: "project", discussionId: "discussion" } });
  });

  it("rejects a discussion if the project became private before the locked write", async () => {
    mocks.findProject.mockResolvedValueOnce({ id: "project", ownerId: "owner", isPublic: true }).mockResolvedValueOnce({ id: "project", ownerId: "owner", isPublic: false });
    const response = await POST(request("POST", { title: "Late discussion" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(404);
    expect(mocks.createDiscussion).not.toHaveBeenCalled();
  });

  it("allows the owner to create a discussion without notifying themself", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await POST(request("POST", { title: "Owner thread" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createDiscussion).toHaveBeenCalledWith(expect.objectContaining({ data: { projectId: "project", authorId: "owner", title: "Owner thread", body: "" } }));
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("rejects invalid or non-strict discussion input", async () => {
    for (const body of [{ title: "   " }, { title: "x".repeat(201) }, { title: "Valid", category: "idea" }]) {
      const response = await POST(request("POST", body), { params: Promise.resolve({ slug: "demo" }) });
      expect(response.status).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps private projects out of the public collaboration endpoint", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: false });
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await POST(request("POST", { title: "Private" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
