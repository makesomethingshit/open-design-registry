import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findDiscussion: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { discussion: { findFirst: mocks.findDiscussion } } }));

const { GET } = await import("./route");

describe("project discussion detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.findDiscussion.mockResolvedValue({
      id: "discussion", title: "Direction", body: "Keep it simple", createdAt: new Date(),
      author: { name: "Author" }, project: { slug: "demo", title: "Demo", ownerId: "owner", isPublic: true },
      comments: [{ id: "comment", body: "Agreed", createdAt: new Date(), author: { name: "Visitor" } }],
    });
  });

  it("returns a public discussion and its comments to anonymous readers", async () => {
    const response = await GET(new Request("http://localhost/api/projects/demo/discussions/discussion"), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ body: "Keep it simple", comments: [{ body: "Agreed" }], project: { slug: "demo", title: "Demo" } });
    expect(mocks.findDiscussion).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "discussion", project: { slug: "demo" } }, select: expect.objectContaining({ comments: { orderBy: { createdAt: "asc" }, select: expect.any(Object) } }) }));
  });

  it.each([
    ["anonymous", null],
    ["non-owner", { user: { id: "visitor" } }],
  ])("hides a private discussion from a %s reader", async (_label, session) => {
    mocks.findDiscussion.mockResolvedValue({ id: "discussion", project: { slug: "demo", title: "Demo", ownerId: "owner", isPublic: false } });
    mocks.getSession.mockResolvedValue(session);
    const response = await GET(new Request("http://localhost/api/projects/demo/discussions/discussion"), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
    expect(response.status).toBe(404);
  });

  it("allows the private project owner to read the discussion", async () => {
    mocks.findDiscussion.mockResolvedValue({ id: "discussion", title: "Direction", body: "Private", createdAt: new Date(), author: { name: "Owner" }, project: { slug: "demo", title: "Demo", ownerId: "owner", isPublic: false }, comments: [] });
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await GET(new Request("http://localhost/api/projects/demo/discussions/discussion"), { params: Promise.resolve({ slug: "demo", id: "discussion" }) });
    expect(response.status).toBe(200);
  });
});
