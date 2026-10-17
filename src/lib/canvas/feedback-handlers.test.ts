import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  comment: vi.fn(async () => ({ id: "comment-1", itemId: "item-1" })),
  layout: vi.fn(async () => ({ layoutVersion: 1 })),
}));

vi.mock("../auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "designer" } }) } } }));
vi.mock("./feedback", () => ({
  createCanvasComment: mocks.comment,
  editCanvasLayout: mocks.layout,
  readCanvasComments: vi.fn(),
}));
vi.mock("./service", () => ({ canvasFailure: () => null }));

import { canvasFeedbackRequest } from "./feedback-handlers";

const scope = { slug: "project", canvasId: "canvas-1" };
const url = "http://localhost/api/projects/project/canvases/canvas-1/comments";

describe("Canvas feedback JSON request limit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an oversized Content-Length body before calling a mutation", async () => {
    const request = new Request(url, {
      method: "POST", headers: { "content-type": "application/json", "content-length": "70000" },
      body: JSON.stringify({ itemId: "item-1", body: "valid" }),
    });
    const response = await canvasFeedbackRequest(request, scope);
    expect(response.status).toBe(413);
    expect(mocks.comment).not.toHaveBeenCalled();
  });

  it("rejects measured bytes even without Content-Length", async () => {
    const request = new Request(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: "item-1", body: "x".repeat(70_000) }),
    });
    request.headers.delete("content-length");
    const response = await canvasFeedbackRequest(request, scope);
    expect(response.status).toBe(413);
    expect(mocks.comment).not.toHaveBeenCalled();
  });

  it("retains normal comment and layout request behavior", async () => {
    const comment = { itemId: "item-1", body: "A thought" };
    const response = await canvasFeedbackRequest(new Request(url, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(comment),
    }), scope);
    expect(response.status).toBe(201);
    expect(mocks.comment).toHaveBeenCalledWith("project", "canvas-1", "designer", comment);

    const layout = { itemId: "item-1", expectedCanvasVersion: 0, rect: { x: 0, y: 0, width: 320, height: 240, zIndex: 0 } };
    const changed = await canvasFeedbackRequest(new Request(url, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(layout),
    }), scope);
    expect(changed.status).toBe(200);
    expect(mocks.layout).toHaveBeenCalledWith("project", "canvas-1", "designer", layout);
  });
});
