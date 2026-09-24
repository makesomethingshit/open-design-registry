import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findRevisions: vi.fn(),
  findLatestRelease: vi.fn(),
  createRelease: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.findProject },
  revision: { findMany: mocks.findRevisions },
  $transaction: mocks.transaction,
} }));

const { POST } = await import("./route");
const validBody = { title: "Navigation rethink", description: "A focused change.", revisionIds: ["revision-4", "revision-3"] };

function request(body: unknown = validBody) {
  return new Request("http://localhost/api/projects/demo/releases", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("project releases route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic: true });
    mocks.findRevisions.mockResolvedValue([
      { id: "revision-4", projectId: "project", number: 4, isPublished: true },
      { id: "revision-3", projectId: "project", number: 3, isPublished: true },
    ]);
    mocks.findLatestRelease.mockResolvedValue({ number: 2 });
    mocks.createRelease.mockResolvedValue({ id: "release-3", number: 3 });
    mocks.transaction.mockImplementation(async (callback) => callback({ release: { findFirst: mocks.findLatestRelease, create: mocks.createRelease } } as never));
  });

  it("returns 404 for a missing project before checking session", async () => {
    mocks.findProject.mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ slug: "missing" }) });
    expect(response.status).toBe(404);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["public", true, 403],
    ["private", false, 404],
  ])("keeps a non-owner out of a %s project", async (_label, isPublic, status) => {
    mocks.findProject.mockResolvedValue({ id: "project", ownerId: "owner", isPublic });
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(status);
    expect(mocks.findRevisions).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["invalid title", { ...validBody, title: " " }],
    ["duplicate revisions", { ...validBody, revisionIds: ["revision-3", " revision-3 "] }],
    ["unknown fields", { ...validBody, reorder: true }],
  ])("rejects %s before opening a transaction", async (_label, body) => {
    const input = typeof body === "string" ? new Request("http://localhost/api/projects/demo/releases", { method: "POST", body }) : request(body);
    const response = await POST(input, { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown revision", []],
    ["revision from another project", [{ id: "revision-3", projectId: "other", number: 3, isPublished: true }, { id: "revision-4", projectId: "project", number: 4, isPublished: true }]],
    ["unpublished revision", [{ id: "revision-3", projectId: "project", number: 3, isPublished: false }, { id: "revision-4", projectId: "project", number: 4, isPublished: true }]],
  ])("rejects an %s", async (_label, revisions) => {
    mocks.findRevisions.mockResolvedValue(revisions);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates the next numbered release and stores revisions in number order in one transaction", async () => {
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "release-3", number: 3 });
    expect(mocks.findLatestRelease).toHaveBeenCalledWith({ where: { projectId: "project" }, orderBy: { number: "desc" }, select: { number: true } });
    expect(mocks.createRelease).toHaveBeenCalledWith({
      data: {
        projectId: "project",
        number: 3,
        title: "Navigation rethink",
        description: "A focused change.",
        publishedById: "owner",
        revisions: { create: [
          { position: 0, revision: { connect: { id: "revision-3" } } },
          { position: 1, revision: { connect: { id: "revision-4" } } },
        ] },
      },
      select: { id: true, number: true },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 409 on a concurrent project release-number conflict", async () => {
    const conflict = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["projectId", "number"] } });
    Object.setPrototypeOf(conflict, Prisma.PrismaClientKnownRequestError.prototype);
    mocks.transaction.mockRejectedValue(conflict);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "A release was published at the same time. Review your selection and try again." });
  });
});
