import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findDiscussion: vi.fn(), createComment: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { discussion: { findFirst: mocks.findDiscussion }, discussionComment: { create: mocks.createComment }, notification: { create: vi.fn() } } }));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/demo/discussions/discussion/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("discussion comments route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "commenter" } });
    mocks.findDiscussion.mockResolvedValue({ id: "discussion" });
    mocks.createComment.mockResolvedValue({ id: "comment", body: "Useful note", author: { name: "Commenter" } });
  });

  it("requires a signed-in user", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ body: "Useful note" }), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
    expect(response.status).toBe(401);
    expect(mocks.findDiscussion).not.toHaveBeenCalled();
  });

  it("creates a comment on a public discussion", async () => {
    const response = await POST(request({ body: " Useful note " }), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
    expect(response.status).toBe(201);
    expect(mocks.findDiscussion).toHaveBeenCalledWith({ where: { id: "discussion", project: { slug: "demo", isPublic: true } }, select: { id: true } });
    expect(mocks.createComment).toHaveBeenCalledWith(expect.objectContaining({ data: { discussionId: "discussion", authorId: "commenter", body: "Useful note" } }));
  });

  it("rejects invalid and non-strict comment input", async () => {
    for (const body of [{ body: "  " }, { body: "x".repeat(10001) }, { body: "Valid", mention: "owner" }]) {
      const response = await POST(request(body), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
      expect(response.status).toBe(400);
    }
    expect(mocks.createComment).not.toHaveBeenCalled();
  });

  it("returns 404 for comments on private projects", async () => {
    mocks.findDiscussion.mockResolvedValue(null);
    const response = await POST(request({ body: "Private" }), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
    expect(response.status).toBe(404);
    expect(mocks.createComment).not.toHaveBeenCalled();
  });
});
