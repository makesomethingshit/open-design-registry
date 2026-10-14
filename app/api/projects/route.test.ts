import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  authSession: vi.fn(),
  projectFindMany: vi.fn(),
  raw: vi.fn(),
  projectCreate: vi.fn(),
  putCover: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.authSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findMany: mocks.projectFindMany, create: mocks.projectCreate }, $queryRaw: mocks.raw } }));
vi.mock("@/src/lib/storage", () => ({
  publicAssetUrl: (value: string) => `/api/assets?key=${encodeURIComponent(value)}`,
  deleteObject: mocks.deleteObject,
  putCover: mocks.putCover,
}));

const { GET, POST } = await import("./route");

function request(query = "") {
  return new Request(`http://localhost/api/projects${query}`);
}

describe("project listing route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.raw.mockResolvedValue([{ slug: "studio" }]);
    mocks.projectFindMany.mockResolvedValue([{ slug: "studio", title: "Studio kit", description: "Reusable components", license: "MIT", isPublic: true, coverUrl: "covers/studio", createdAt: new Date("2026-01-01"), owner: { name: "Author" } }]);
  });

  it("filters public projects by title/description and license", async () => {
    const response = await GET(request("?q=components&license=MIT"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ slug: "studio", coverUrl: "/api/assets?key=covers%2Fstudio" }]);
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { isPublic: true },
          { OR: [{ title: { contains: "components", mode: "insensitive" } }, { description: { contains: "components", mode: "insensitive" } }] },
          { license: "MIT" },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { slug: "desc" }],
    }));
  });

  it("keeps the existing public scope and newest-first order without filters", async () => {
    await GET(request());
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isPublic: true }, orderBy: [{ createdAt: "desc" }, { slug: "desc" }] }));
  });

  it("orders by recent activity when requested", async () => {
    await GET(request("?sort=recent"));
    expect(mocks.raw).toHaveBeenCalledOnce();
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([{ slug: { in: ["studio"] } }]) }) }));
  });

  it("preserves SQL order, the recent cursor and the bounded paginated response", async () => {
    mocks.raw.mockResolvedValue([{ slug: "beta" }, { slug: "alpha" }, { slug: "gamma" }]);
    mocks.projectFindMany.mockResolvedValue(["gamma", "alpha", "beta"].map((slug) => ({ slug, coverUrl: `covers/${slug}` })));
    const response = await GET(request("?sort=recent&limit=2&cursor=anchor"));
    expect(await response.json()).toEqual({ items: [
      { slug: "beta", coverUrl: "/api/assets?key=covers%2Fbeta" },
      { slug: "alpha", coverUrl: "/api/assets?key=covers%2Falpha" },
    ], nextCursor: "alpha" });
    const sql = mocks.raw.mock.calls[0][0];
    expect(sql.values).toEqual(expect.arrayContaining(["anchor", 3]));
    expect(mocks.raw).toHaveBeenCalledOnce();
    expect(mocks.projectFindMany).toHaveBeenCalledOnce();
    expect(mocks.projectFindMany.mock.calls[0][0].where.AND).toContainEqual({ isPublic: true });
  });

  it("retains recent array headers and clamps page size without changing oldest sorting", async () => {
    mocks.raw.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({ slug: `project-${index}` })));
    mocks.projectFindMany.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({ slug: `project-${index}`, coverUrl: "cover" })).reverse());
    const response = await GET(request("?sort=recent"));
    expect((await response.json()).map((row: { slug: string }) => row.slug)).toEqual(Array.from({ length: 24 }, (_, index) => `project-${index}`));
    expect(response.headers.get("X-Has-More")).toBe("true");
    expect(response.headers.get("X-Next-Cursor")).toBe("project-23");
    await GET(request("?sort=recent&limit=1000"));
    expect(mocks.raw.mock.calls[1][0].values.at(-1)).toBe(101);
    await GET(request("?sort=oldest&limit=2"));
    expect(mocks.projectFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "asc" }, { slug: "asc" }], take: 3 }));
  });

  it("rereads ownership and public visibility when hydrating recent results", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    await GET(request("?sort=recent&q=kit&license=MIT&tool=Penpot&tags=UI,mobile"));
    expect(mocks.raw.mock.calls[0][0].values).toEqual(expect.arrayContaining(["owner", "%kit%", "MIT", "penpot", ["ui", "mobile"]]));
    expect(mocks.projectFindMany.mock.calls[0][0].where.AND[0].AND).toEqual([
      { OR: [{ isPublic: true }, { ownerId: "owner" }] },
      { OR: [{ title: { contains: "kit", mode: "insensitive" } }, { description: { contains: "kit", mode: "insensitive" } }] },
      { license: "MIT" },
      { revisions: { some: { tool: { equals: "penpot" }, tags: { hasEvery: ["ui", "mobile"] } } } },
    ]);
    mocks.projectFindMany.mockResolvedValue([]);
    const response = await GET(request("?sort=recent&limit=2"));
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });
});

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const jpeg = new Uint8Array([255, 216, 255, 224, 0]);

function uploadCover(bytes: Uint8Array, type = "image/png", publicProject = true) {
  const form = new FormData();
  form.set("title", "Studio kit");
  form.set("description", "A reusable project");
  form.set("license", "MIT");
  form.set("isPublic", String(publicProject));
  form.set("rightsConfirmed", "true");
  form.set("cover", new File([Uint8Array.from(bytes).buffer], "cover.png", { type }));
  return new Request("http://localhost/api/projects", { method: "POST", body: form });
}

describe("project cover uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.putCover.mockResolvedValue("/api/assets?key=covers%2Fowner%2Fstudio");
    mocks.deleteObject.mockResolvedValue(undefined);
    mocks.projectCreate.mockResolvedValue({
      id: "project1", slug: "studio", title: "Studio kit", description: "A reusable project",
      license: "MIT", isPublic: true, coverUrl: "/api/assets?key=covers%2Fowner%2Fstudio", ownerId: "owner",
    });
  });

  it("requires sign-in before reading or storing a cover", async () => {
    mocks.authSession.mockResolvedValue(null);
    expect((await POST(uploadCover(png))).status).toBe(401);
    expect(mocks.putCover).not.toHaveBeenCalled();
    expect(mocks.projectCreate).not.toHaveBeenCalled();
  });

  it("rejects empty, truncated, mislabeled, and unsupported covers before any storage call", async () => {
    const invalid: [Uint8Array, string][] = [
      [new Uint8Array(), "image/png"],
      [new Uint8Array([137, 80, 78]), "image/png"],
      [new TextEncoder().encode("<html>not an image</html>"), "image/png"],
      [new TextEncoder().encode("not a JPEG"), "image/jpeg"],
      [png, "image/jpeg"],
      [jpeg, "image/png"],
      [png, "image/svg+xml"],
      [new Uint8Array(10 * 1024 * 1024 + 1), "image/png"],
    ];
    for (const [bytes, type] of invalid) {
      const response = await POST(uploadCover(bytes, type));
      expect(response.status).toBe(400);
    }
    expect(mocks.putCover).not.toHaveBeenCalled();
    expect(mocks.projectCreate).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("accepts PNG and JPEG signatures without changing the project creation flow", async () => {
    for (const [bytes, type] of [[png, "image/png"], [jpeg, "image/jpeg"]] as const) {
      const response = await POST(uploadCover(bytes, type));
      expect(response.status).toBe(201);
      expect(mocks.putCover).toHaveBeenCalledWith(expect.any(File), expect.stringMatching(new RegExp("^covers/owner/studio-kit-[0-9a-f]{8}$")));
      expect(mocks.projectCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
        title: "Studio kit", isPublic: true, ownerId: "owner", publicationConfirmedBy: "owner",
      }) });
    }
    expect(mocks.putCover).toHaveBeenCalledTimes(2);
    expect(mocks.projectCreate).toHaveBeenCalledTimes(2);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("preserves cleanup when storage fails after a valid upload", async () => {
    mocks.putCover.mockRejectedValueOnce(new Error("S3 unavailable"));
    const logging = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect((await POST(uploadCover(png))).status).toBe(500);
      expect(mocks.projectCreate).not.toHaveBeenCalled();
      expect(mocks.deleteObject).toHaveBeenCalledWith(expect.stringMatching(new RegExp("^covers/owner/studio-kit-[0-9a-f]{8}$")));
    } finally {
      logging.mockRestore();
    }
  });
});
