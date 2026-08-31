import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  transaction: vi.fn(),
  reportFindUnique: vi.fn(),
  revisionFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  projectUpdateMany: vi.fn(),
  reportUpdate: vi.fn(),
}));

vi.mock("@/src/lib/moderation", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

const { PATCH } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/reports/report-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("admin report resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminSession.mockResolvedValue({ user: { id: "admin" } });
    mocks.reportFindUnique.mockResolvedValue({ id: "report-1", projectId: "source", revisionId: null });
    mocks.projectFindUnique.mockResolvedValue({ coverUrl: "/api/assets?key=covers/source/project" });
    mocks.projectUpdateMany.mockResolvedValue({ count: 2 });
    mocks.reportUpdate.mockResolvedValue({ id: "report-1", status: "RESOLVED" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      report: { findUnique: mocks.reportFindUnique, update: mocks.reportUpdate },
      revision: { findUnique: mocks.revisionFindUnique },
      project: { findUnique: mocks.projectFindUnique, updateMany: mocks.projectUpdateMany },
    }));
  });

  it("hides forks that share a reported project's cover asset", async () => {
    const response = await PATCH(request({ status: "RESOLVED", hide: true }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.projectUpdateMany).toHaveBeenCalledWith({ where: { coverUrl: "/api/assets?key=covers/source/project" }, data: { isPublic: false } });
  });
});
