import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), createProject: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject, create: mocks.createProject } } }));

const { POST } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/projects/demo/revisions/1/fork", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("revision fork route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "forker" } });
    mocks.findProject.mockResolvedValue({ id: "project", title: "Design", description: "Notes", license: "CC BY 4.0", coverUrl: "https://cdn/cover", isPublic: true, owner: { id: "owner", name: "Author" }, revisions: [{ id: "revision", number: 1 }] });
    mocks.createProject.mockResolvedValue({ slug: "design-fork" });
  });

  it.each([undefined, false])("rejects missing or false rights confirmation (%s)", async (rightsConfirmed) => {
    const response = await POST(request({ title: "Fork", ...(rightsConfirmed === undefined ? {} : { rightsConfirmed }) }), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(response.status).toBe(400);
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("records a public fork only after explicit confirmation", async () => {
    const response = await POST(request({ title: "Fork", rightsConfirmed: true }), { params: Promise.resolve({ slug: "demo", number: "1" }) });
    expect(response.status).toBe(201);
    expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isPublic: true, publicationConfirmedBy: "forker", forkedFromProjectId: "project", forkedFromRevisionId: "revision", forkedFromLicense: "CC BY 4.0" }) }));
  });
});
