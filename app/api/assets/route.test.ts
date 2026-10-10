import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  projectFindMany: vi.fn(),
  documentProject: vi.fn(),
  previewFindMany: vi.fn(),
  revisionFindMany: vi.fn(),
  getObject: vi.fn(),
  moderationAssetFindFirst: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  project: { findMany: mocks.projectFindMany, findUnique: mocks.documentProject },
  preview: { findMany: mocks.previewFindMany },
  revision: { findMany: mocks.revisionFindMany },
  moderationAssetBlock: { findFirst: mocks.moderationAssetFindFirst },
} }));
vi.mock("@/src/lib/storage", () => ({
  assetUrl: (key: string) => `/api/assets?key=${encodeURIComponent(key)}`,
  legacyObjectUrl: (key: string) => `https://open-design-registry.s3.us-east-1.amazonaws.com/${key}`,
  getObject: mocks.getObject,
}));

const { GET } = await import("./route");

function request(query: string, headers?: HeadersInit) {
  return new Request(`http://localhost/api/assets?${query}`, { headers });
}

const body = { transformToWebStream: () => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("asset")); controller.close(); } }) };

describe("asset proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.moderationAssetFindFirst.mockResolvedValue(null);
    mocks.projectFindMany.mockResolvedValue([]);
    mocks.documentProject.mockResolvedValue(null);
    mocks.previewFindMany.mockResolvedValue([]);
    mocks.revisionFindMany.mockResolvedValue([]);
    mocks.getObject.mockResolvedValue({ Body: body, ContentType: "image/png", ContentLength: 5 });
  });

  it("serves a public asset through the private-object proxy", async () => {
    mocks.projectFindMany.mockResolvedValue([{ isPublic: true, ownerId: "owner" }]);
    const response = await GET(request("key=covers%2Fowner%2Fproject"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("asset");
    expect(mocks.getObject).toHaveBeenCalledWith("covers/owner/project");
  });

  it("blocks anonymous access to a private asset", async () => {
    mocks.projectFindMany.mockResolvedValue([{ isPublic: false, ownerId: "owner" }]);
    const response = await GET(request("key=covers%2Fowner%2Fproject"));
    expect(response.status).toBe(404);
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("allows the private project owner", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.projectFindMany.mockResolvedValue([{ isPublic: false, ownerId: "owner" }]);
    const response = await GET(request("key=covers%2Fowner%2Fproject"));
    expect(response.status).toBe(200);
  });

  it("can proxy a legacy S3 URL after the bucket is made private", async () => {
    mocks.projectFindMany.mockResolvedValue([{ isPublic: true, ownerId: "owner" }]);
    const response = await GET(request("url=https%3A%2F%2Fopen-design-registry.s3.us-east-1.amazonaws.com%2Fcovers%2Fowner%2Fproject"));
    expect(response.status).toBe(200);
    expect(mocks.getObject).toHaveBeenCalledWith("covers/owner/project");
  });

  it("rejects mixed key and legacy URL parameters", async () => {
    mocks.projectFindMany.mockResolvedValue([{ isPublic: true, ownerId: "owner" }]);
    const response = await GET(request("key=revisions%2Fprivate%2Fsource.zip&url=https%3A%2F%2Fopen-design-registry.s3.us-east-1.amazonaws.com%2Fcovers%2Fpublic%2Fproject"));
    expect(response.status).toBe(404);
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("forces uploaded revision sources to download safely", async () => {
    mocks.revisionFindMany.mockResolvedValue([{ project: { isPublic: true, ownerId: "owner" } }]);
    mocks.getObject.mockResolvedValue({ Body: body, ContentType: "text/html", ContentLength: 5 });
    const response = await GET(request("key=revisions%2Fpublic%2Fsource.html"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
  });

  it("does not authorize document uploads through unrelated public cover, preview or revision references", async () => {
    const key = "project-documents/project1/00000000-0000-4000-8000-000000000000.png";
    const publicProject = { isPublic: true, ownerId: "other-owner" };
    mocks.projectFindMany.mockResolvedValue([publicProject]);
    mocks.previewFindMany.mockResolvedValue([{ revision: { project: publicProject } }]);
    mocks.revisionFindMany.mockResolvedValue([{ project: publicProject }]);
    mocks.documentProject.mockResolvedValue({ isPublic: false, ownerId: "owner", document: "" });
    for (const query of [`key=${encodeURIComponent(key)}`, `url=${encodeURIComponent(`https://open-design-registry.s3.us-east-1.amazonaws.com/${key}`)}`]) {
      expect((await GET(request(query))).status).toBe(404);
    }
    mocks.getSession.mockResolvedValue({ user: { id: "other-owner" } });
    expect((await GET(request(`key=${encodeURIComponent(key)}`))).status).toBe(404);
    expect(mocks.getObject).not.toHaveBeenCalled();
  });

  it("keeps draft document uploads private until they are rendered in a public project's saved document", async () => {
    const key = "project-documents/project1/00000000-0000-4000-8000-000000000000.png";
    const query = `key=${encodeURIComponent(key)}`;
    const image = `![Design](/api/assets?${query})`;
    mocks.documentProject.mockResolvedValue({ isPublic: true, ownerId: "owner", document: "" });
    expect((await GET(request(query))).status).toBe(404);
    expect(mocks.getObject).not.toHaveBeenCalled();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    expect((await GET(request(query))).status).toBe(200);
    mocks.getSession.mockResolvedValue(null);
    for (const document of [`\u0060${image}\u0060`, `\u0060\u0060\u0060\n${image}\n\u0060\u0060\u0060`, `/api/assets?${query}`, `[Design](/api/assets?${query})`]) {
      mocks.documentProject.mockResolvedValue({ isPublic: true, ownerId: "owner", document });
      expect((await GET(request(query))).status).toBe(404);
    }
    mocks.documentProject.mockResolvedValue({ isPublic: true, ownerId: "owner", document: image });
    expect((await GET(request(query))).status).toBe(200);
    mocks.documentProject.mockResolvedValue({ isPublic: false, ownerId: "owner", document: image });
    expect((await GET(request(query))).status).toBe(404);
    mocks.getSession.mockResolvedValue({ user: { id: "other-owner" } });
    expect((await GET(request(query))).status).toBe(404);
  });
  it("blocks a moderated object regardless of public/owner references or legacy URL", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.projectFindMany.mockResolvedValue([{ isPublic: true, ownerId: "owner" }]);
    mocks.moderationAssetFindFirst.mockResolvedValue({ key: "covers/owner/project" });
    const path = "covers/owner/project";
    const modern = await GET(request(`key=${encodeURIComponent(path)}`));
    const legacy = await GET(request(`url=${encodeURIComponent("https://open-design-registry.s3.us-east-1.amazonaws.com/" + path)}`));
    expect(modern.status).toBe(404);
    expect(legacy.status).toBe(404);
    expect(mocks.getObject).not.toHaveBeenCalled();
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
  });

  it("checks all active report-level holds rather than only one global block", async () => {
    const holds = [
      { key: "covers/owner/project", reportId: "report-A", blocked: false },
      { key: "covers/owner/project", reportId: "report-B", blocked: true },
    ];
    mocks.moderationAssetFindFirst.mockImplementation(async ({ where }: { where: { key: string; blocked: boolean } }) =>
      holds.find((hold) => hold.key === where.key && hold.blocked === where.blocked) ?? null
    );
    mocks.projectFindMany.mockResolvedValue([{ isPublic: true, ownerId: "owner" }]);
    const key = "key=covers%2Fowner%2Fproject";
    expect((await GET(request(key))).status).toBe(404);
    expect(mocks.moderationAssetFindFirst).toHaveBeenCalledWith({
      where: { key: "covers/owner/project", blocked: true },
      select: { key: true },
    });
    holds[1].blocked = false;
    expect((await GET(request(key))).status).toBe(200);
  });

  it("preserves normal access control after a moderation block is lifted", async () => {
    mocks.moderationAssetFindFirst.mockResolvedValue(null);
    mocks.projectFindMany.mockResolvedValue([{ isPublic: true, ownerId: "owner" }]);
    expect((await GET(request("key=covers%2Fowner%2Fproject"))).status).toBe(200);
    mocks.projectFindMany.mockResolvedValue([{ isPublic: false, ownerId: "owner" }]);
    expect((await GET(request("key=covers%2Fowner%2Fproject"))).status).toBe(404);
  });

});
