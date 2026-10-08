import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findIssue: vi.fn(), createComment: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    issue: { findUnique: mocks.findIssue },
    issueComment: { create: mocks.createComment },
    $transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: async () => [{ id: "issue-1" }],
        issue: { findUnique: mocks.findIssue },
        issueComment: { create: mocks.createComment },
      }),
  },
}));

const { POST } = await import("./route");

function request(body: unknown) {
  return new Request("http://localhost/api/issues/issue-1/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("issue comment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "commenter" } });
    mocks.findIssue.mockResolvedValue({ project: { isPublic: true }, status: "OPEN" });
    mocks.createComment.mockResolvedValue({ id: "comment-1", body: "Looks good" });
  });

  it("rejects comments on closed issues", async () => {
    mocks.findIssue.mockResolvedValue({ project: { isPublic: true }, status: "CLOSED" });
    const response = await POST(request({ body: "Still relevant" }), { params: Promise.resolve({ id: "issue-1" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Issue is closed" });
    expect(mocks.createComment).not.toHaveBeenCalled();
  });

  it("creates a comment on an open public issue", async () => {
    const response = await POST(request({ body: "Looks good" }), { params: Promise.resolve({ id: "issue-1" }) });
    expect(response.status).toBe(201);
    expect(mocks.createComment).toHaveBeenCalledWith({ data: { issueId: "issue-1", authorId: "commenter", body: "Looks good" }, include: { author: { select: { id: true, name: true } } } });
  });
});
