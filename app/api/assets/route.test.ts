import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  projectFindMany: vi.fn(),
  previewFindMany: vi.fn(),
  revisionFindMany: vi.fn(),
  getObject: vi.fn(),
  contributionEvent: vi.fn(),
}));

vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  contributionEvent: { findFirst: mocks.contributionEvent },
  project: { findMany: mocks.projectFindMany },
  preview: { findMany: mocks.previewFindMany },
  revision: { findMany: mocks.revisionFindMany },
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
    mocks.contributionEvent.mockResolvedValue(null);
    mocks.projectFindMany.mockResolvedValue([]);
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
});
