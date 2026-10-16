import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findRevisions: vi.fn(),
  findRequestRelease: vi.fn(),
  findLatestRelease: vi.fn(),
  createRelease: vi.fn(),
  findWatchers: vi.fn(),
  createNotifications: vi.fn(),
  lockProject: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.findProject },
  revision: { findMany: mocks.findRevisions },
  release: { findUnique: mocks.findRequestRelease },
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
    mocks.findRequestRelease.mockResolvedValue(null);
    mocks.findLatestRelease.mockResolvedValue({ number: 2 });
    mocks.findWatchers.mockResolvedValue([]);
    mocks.createNotifications.mockResolvedValue({ count: 0 });
    mocks.createRelease.mockResolvedValue({ id: "release-3", number: 3 });
    mocks.lockProject.mockResolvedValue([{ id: "project", isPublic: true }]);
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.lockProject, release: { findUnique: mocks.findRequestRelease, findFirst: mocks.findLatestRelease, create: mocks.createRelease }, projectWatch: { findMany: mocks.findWatchers }, notification: { createMany: mocks.createNotifications } } as never));
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
    expect(mocks.lockProject).toHaveBeenCalledTimes(1);
    const [lockSql, lockedProjectId] = mocks.lockProject.mock.calls[0] as [TemplateStringsArray, string];
    expect(lockSql.join("")).toContain('SELECT id, "isPublic" FROM "Project" WHERE id = ');
    expect(lockSql.join("")).toContain("FOR UPDATE");
    expect(lockedProjectId).toBe("project");
    expect(mocks.lockProject.mock.invocationCallOrder[0]).toBeLessThan(mocks.findLatestRelease.mock.invocationCallOrder[0]);
    expect(mocks.findLatestRelease.mock.invocationCallOrder[0]).toBeLessThan(mocks.createRelease.mock.invocationCallOrder[0]);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("replays an exact request without creating a release or duplicate notifications", async () => {
    const requestId = "3466d7a0-007d-4a11-b1ee-393d16ef1a34";
    mocks.findRequestRelease.mockResolvedValue({ id: "release-2", number: 2, title: "Navigation rethink", description: "A focused change.", revisions: [{ revisionId: "revision-3" }, { revisionId: "revision-4" }] });
    const response = await POST(request({ ...validBody, requestId }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "release-2", number: 2 });
    expect(mocks.findRequestRelease).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId_publishedById_requestId: { projectId: "project", publishedById: "owner", requestId } } }));
    expect(mocks.findLatestRelease).not.toHaveBeenCalled();
    expect(mocks.createRelease).not.toHaveBeenCalled();
    expect(mocks.createNotifications).not.toHaveBeenCalled();
  });

  it("rejects a reused request ID when the canonical payload changes", async () => {
    mocks.findRequestRelease.mockResolvedValue({ id: "release-2", number: 2, title: "Different title", description: "A focused change.", revisions: [{ revisionId: "revision-3" }, { revisionId: "revision-4" }] });
    const response = await POST(request({ ...validBody, requestId: "3466d7a0-007d-4a11-b1ee-393d16ef1a34" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This request ID was already used for a different release" });
    expect(mocks.createRelease).not.toHaveBeenCalled();
    expect(mocks.createNotifications).not.toHaveBeenCalled();
  });

  it("creates a new release when the same content uses a different request ID", async () => {
    const requestId = "f0e0c8c2-f6c7-4f78-9cc5-71f8d0c8d2a5";
    const response = await POST(request({ ...validBody, requestId }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.createRelease).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requestId }) }));
  });

  it("returns 404 if the project is missing when the transaction locks it", async () => {
    mocks.lockProject.mockResolvedValue([]);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(404);
    expect(mocks.findLatestRelease).not.toHaveBeenCalled();
    expect(mocks.createRelease).not.toHaveBeenCalled();
  });

  it("serializes concurrent release-number allocation on the Project row", async () => {
    let latestNumber = 2;
    let lockHeld = false;
    const waiting: Array<() => void> = [];
    mocks.lockProject.mockImplementation(async () => {
      if (lockHeld) await new Promise<void>((resolve) => waiting.push(resolve));
      else lockHeld = true;
      return [{ id: "project" }];
    });
    mocks.findLatestRelease.mockImplementation(async () => ({ number: latestNumber }));
    mocks.createRelease.mockImplementation(async ({ data }: { data: { number: number } }) => {
      latestNumber = data.number;
      return { id: `release-${data.number}`, number: data.number };
    });
    mocks.transaction.mockImplementation(async (callback) => {
      try {
         return await callback({ $queryRaw: mocks.lockProject, release: { findUnique: mocks.findRequestRelease, findFirst: mocks.findLatestRelease, create: mocks.createRelease }, projectWatch: { findMany: mocks.findWatchers }, notification: { createMany: mocks.createNotifications } } as never);
      } finally {
        const next = waiting.shift();
        if (next) next();
        else lockHeld = false;
      }
    });

    const responses = await Promise.all([
      POST(request(), { params: Promise.resolve({ slug: "demo" }) }),
      POST(request(), { params: Promise.resolve({ slug: "demo" }) }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual([
      { id: "release-3", number: 3 },
      { id: "release-4", number: 4 },
    ]);
    expect(mocks.lockProject).toHaveBeenCalledTimes(2);
    expect(mocks.findLatestRelease).toHaveBeenCalledTimes(2);
    expect(mocks.createRelease).toHaveBeenCalledTimes(2);
  });

  it("keeps the unique-constraint 409 mapping as a defensive fallback", async () => {
    const conflict = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["projectId", "number"] } });
    Object.setPrototypeOf(conflict, Prisma.PrismaClientKnownRequestError.prototype);
    mocks.transaction.mockRejectedValue(conflict);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "A release was published at the same time. Review your selection and try again." });
  });

  it("reconciles a request-ID unique race by reading the committed release", async () => {
    const requestId = "3466d7a0-007d-4a11-b1ee-393d16ef1a34";
    const conflict = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["projectId", "publishedById", "requestId"] } });
    Object.setPrototypeOf(conflict, Prisma.PrismaClientKnownRequestError.prototype);
    mocks.transaction.mockRejectedValue(conflict);
    mocks.findRequestRelease.mockResolvedValue({ id: "release-3", number: 3, title: "Navigation rethink", description: "A focused change.", revisions: [{ revisionId: "revision-3" }, { revisionId: "revision-4" }] });
    const response = await POST(request({ ...validBody, requestId }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "release-3", number: 3 });
    expect(mocks.createRelease).not.toHaveBeenCalled();
  });
  it("notifies project watchers except the publisher on publish", async () => {
    mocks.findWatchers.mockResolvedValue([{ userId: "watcher-1" }]);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.findWatchers).toHaveBeenCalledWith({ where: { projectId: "project", userId: { not: "owner" } }, select: { userId: true } });
    expect(mocks.createNotifications).toHaveBeenCalledWith({ data: [
      { recipientId: "watcher-1", actorId: "owner", type: "RELEASE_PUBLISHED", projectId: "project", releaseId: "release-3" },
    ] });
  });

  it.each(["lookup", "insert"]) ("returns 500 when watcher notification %s fails and rejects the publishing transaction", async (step) => {
    const failure = new Error("notification unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (step === "lookup") mocks.findWatchers.mockRejectedValueOnce(failure);
    else {
      mocks.findWatchers.mockResolvedValueOnce([{ userId: "watcher-1" }]);
      mocks.createNotifications.mockRejectedValueOnce(failure);
    }

    try {
      expect((await POST(request(), { params: Promise.resolve({ slug: "demo" }) })).status).toBe(500);
      await expect(mocks.transaction.mock.results[0].value).rejects.toBe(failure);
    } finally {
      log.mockRestore();
    }
  });

  it("skips watch notifications when nobody watches the project", async () => {
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.findWatchers).toHaveBeenCalled();
    expect(mocks.createNotifications).not.toHaveBeenCalled();
  });

  it("does not notify preserved watchers while the project is private", async () => {
    mocks.lockProject.mockResolvedValue([{ id: "project", isPublic: false }]);
    mocks.findWatchers.mockResolvedValue([{ userId: "watcher" }]);
    const response = await POST(request(), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(201);
    expect(mocks.findWatchers).not.toHaveBeenCalled();
    expect(mocks.createNotifications).not.toHaveBeenCalled();
  });
});
