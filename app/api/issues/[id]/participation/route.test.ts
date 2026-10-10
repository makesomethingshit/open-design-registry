import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ post: vi.fn(), remove: vi.fn() }));
vi.mock("@/src/lib/design-request-participation", () => ({ postDesignRequestParticipation: mocks.post, deleteDesignRequestParticipation: mocks.remove }));

const { DELETE, POST } = await import("./route");

describe("issue participation route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the awaited issue id to POST and DELETE handlers", async () => {
    const postResponse = new Response(null, { status: 201 });
    const deleteResponse = new Response(null, { status: 204 });
    mocks.post.mockResolvedValue(postResponse);
    mocks.remove.mockResolvedValue(deleteResponse);
    const request = new Request("http://localhost/api/issues/request/participation");
    expect(await POST(request, { params: Promise.resolve({ id: "request" }) })).toBe(postResponse);
    expect(await DELETE(request, { params: Promise.resolve({ id: "request" }) })).toBe(deleteResponse);
    expect(mocks.post).toHaveBeenCalledWith(request, { id: "request" });
    expect(mocks.remove).toHaveBeenCalledWith(request, { id: "request" });
  });
});
