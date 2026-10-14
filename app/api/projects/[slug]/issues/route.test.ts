import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findRevision: vi.fn(), findDiscussion: vi.fn(), createIssue: vi.fn(), findIssues: vi.fn(), createNotification: vi.fn(), transaction: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findRevision }, discussion: { findFirst: mocks.findDiscussion }, issue: { findMany: mocks.findIssues }, $transaction: mocks.transaction } }));

const { GET, POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/demo/issues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("issue list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findIssues.mockResolvedValue([]);
  });

  function get(url: string) {
    return new Request(url);
  }

  function params() {
    return { params: Promise.resolve({ slug: "demo" }) };
  }

  it("returns the issue array with a has-more header for plain requests", async () => {
    mocks.findIssues.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const response = await GET(get("http://localhost/api/projects/demo/issues"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "a" }, { id: "b" }]);
    expect(response.headers.get("X-Has-More")).toBe("false");
    expect(mocks.findIssues).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
  });

  it("paginates into an envelope with the next cursor when pagination is requested", async () => {
    mocks.findIssues.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const response = await GET(get("http://localhost/api/projects/demo/issues?limit=1"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: "a" }], nextCursor: "a" });
    expect(mocks.findIssues).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it("continues from a cursor with skip", async () => {
    mocks.findIssues.mockResolvedValue([{ id: "b" }]);
    const response = await GET(get("http://localhost/api/projects/demo/issues?limit=1&cursor=a"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: "b" }], nextCursor: null });
    expect(mocks.findIssues).toHaveBeenCalledWith(expect.objectContaining({ cursor: { id: "a" }, skip: 1, take: 2 }));
  });
  it("keeps comment author id and name in list responses", async () => {
    mocks.findIssues.mockResolvedValue([{ id: "a", title: "Has comments", comments: [{ id: "c1", body: "Note", author: { id: "commenter", name: "Commenter" } }] }]);
    const response = await GET(get("http://localhost/api/projects/demo/issues"), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "a", title: "Has comments", comments: [{ id: "c1", body: "Note", author: { id: "commenter", name: "Commenter" } }] }]);
    expect(mocks.findIssues).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        comments: expect.objectContaining({ include: { author: { select: { id: true, name: true } } } }),
      }),
    }));
  });
});

describe("issue creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "reporter" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findDiscussion.mockResolvedValue({ id: "discussion" });
    mocks.createIssue.mockResolvedValue({ id: "issue", title: "Broken component", body: "Details", kind: "ISSUE", author: { id: "reporter", name: "Reporter" }, revision: null });
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: async () => [{ id: "project" }], project: { findUnique: mocks.findProject }, issue: { create: mocks.createIssue }, notification: { create: mocks.createNotification } } as never));
  });

  it("requires authentication before creating an issue", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ title: "Broken component", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(401);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("blocks a stale public Issue creation after the project becomes private", async () => {
    mocks.findProject.mockResolvedValueOnce({ id: "project", ownerId: "owner", isPublic: true }).mockResolvedValueOnce({ id: "project", ownerId: "owner", isPublic: false });
    const response = await POST(request({ title: "Late issue", body: "No" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(404);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("notifies the project owner when another user opens an issue", async () => {
    const response = await POST(request({ title: "Broken component", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ kind: "ISSUE" });
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "ISSUE" }) }));
    expect(mocks.createIssue.mock.calls[0][0].data.sourceDiscussionId).toBeUndefined();
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: { recipientId: "owner", actorId: "reporter", type: "ISSUE_CREATED", projectId: "project", issueId: "issue" } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("propagates notification failures from the issue transaction", async () => {
    mocks.createNotification.mockRejectedValueOnce(new Error("notification unavailable"));
    await expect(POST(request({ title: "Broken component", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("notification unavailable");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
  });

  it("preserves provenance for a Discussion in the same project", async () => {
    mocks.createIssue.mockResolvedValue({ id: "issue", title: "Broken component", body: "Details", kind: "ISSUE", sourceDiscussionId: "discussion", author: { id: "reporter", name: "Reporter" }, revision: null });
    const response = await POST(request({ title: "Broken component", body: "Details", sourceDiscussionId: "discussion" }), { params: Promise.resolve({ slug: "demo" }) });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ sourceDiscussionId: "discussion" });
    expect(mocks.findDiscussion).toHaveBeenCalledWith({ where: { id: "discussion", projectId: "project" }, select: { id: true } });
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceDiscussionId: "discussion" }) }));
  });

  it("rejects a Discussion from another project without creating or notifying", async () => {
    mocks.findDiscussion.mockResolvedValue(null);
    const response = await POST(request({ title: "Injected", body: "Details", sourceDiscussionId: "foreign-discussion" }), { params: Promise.resolve({ slug: "demo" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Discussion not found in this project" });
    expect(mocks.findDiscussion).toHaveBeenCalledWith({ where: { id: "foreign-discussion", projectId: "project" }, select: { id: true } });
    expect(mocks.createIssue).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent Discussion without creating or notifying", async () => {
    mocks.findDiscussion.mockResolvedValue(null);
    const response = await POST(request({ title: "Orphan", body: "Details", sourceDiscussionId: "missing-discussion" }), { params: Promise.resolve({ slug: "demo" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Discussion not found in this project" });
    expect(mocks.createIssue).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("does not notify when the project owner opens their own issue", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await POST(request({ title: "Own issue", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("creates a design request for the project owner without an issue notification", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.createIssue.mockResolvedValue({ id: "issue", title: "Improve mobile navigation", body: "Details", kind: "DESIGN_REQUEST", sourceDiscussionId: "discussion", author: { id: "owner", name: "Owner" }, revision: null });
    const response = await POST(request({ title: "Improve mobile navigation", body: "Details", kind: "DESIGN_REQUEST", sourceDiscussionId: "discussion" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ kind: "DESIGN_REQUEST", sourceDiscussionId: "discussion" });
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "DESIGN_REQUEST", sourceDiscussionId: "discussion" }) }));
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("does not allow issue creation to set an open-question marker", async () => {
    const response = await POST(request({ title: "Injected marker", body: "Details", isOpenQuestion: true }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ isOpenQuestion: true }) }));
  });

  it("rejects a design request from a non-owner", async () => {
    const response = await POST(request({ title: "Improve mobile navigation", body: "Details", kind: "DESIGN_REQUEST", sourceDiscussionId: "discussion" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Only the project owner can create design requests" });
    expect(mocks.createIssue).not.toHaveBeenCalled();
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("rejects an unknown issue kind", async () => {
    const response = await POST(request({ title: "Broken component", body: "Details", kind: "TASK" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("keeps issue creation closed on private projects", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: false });
    const response = await POST(request({ title: "Private issue", body: "Details", sourceDiscussionId: "discussion" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(404);
    expect(mocks.findDiscussion).not.toHaveBeenCalled();
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });
});
