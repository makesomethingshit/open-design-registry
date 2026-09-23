import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findRevision: vi.fn(), createIssue: vi.fn(), createNotification: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findFirst: mocks.findRevision }, issue: { create: mocks.createIssue }, notification: { create: mocks.createNotification } } }));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/demo/issues", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("issue creation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "reporter" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.createIssue.mockResolvedValue({ id: "issue", title: "Broken component", body: "Details", author: { id: "reporter", name: "Reporter" }, revision: null });
  });

  it("requires authentication before creating an issue", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ title: "Broken component", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(401);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("notifies the project owner when another user opens an issue", async () => {
    const response = await POST(request({ title: "Broken component", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "ISSUE" }) }));
    expect(mocks.createNotification).toHaveBeenCalledWith({ data: { recipientId: "owner", actorId: "reporter", type: "ISSUE_CREATED", projectId: "project", issueId: "issue" } });
  });

  it("does not notify when the project owner opens their own issue", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await POST(request({ title: "Own issue", body: "Details" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("creates a design request for the project owner without an issue notification", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const response = await POST(request({ title: "Improve mobile navigation", body: "Details", kind: "DESIGN_REQUEST" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "DESIGN_REQUEST" }) }));
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("rejects a design request from a non-owner", async () => {
    const response = await POST(request({ title: "Improve mobile navigation", body: "Details", kind: "DESIGN_REQUEST" }), { params: Promise.resolve({ slug: "demo" }) });
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
});
