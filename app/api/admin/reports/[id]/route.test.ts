import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  reportFindUnique: vi.fn(),
  revisionFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn(),
  holdFindUnique: vi.fn(),
  holdUpsert: vi.fn(),
  holdUpdate: vi.fn(),
  assetFindUnique: vi.fn(),
  assetUpsert: vi.fn(),
  assetUpdate: vi.fn(),
  auditCreate: vi.fn(),
  reportUpdate: vi.fn(),
}));

vi.mock("@/src/lib/moderation", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

const { PATCH } = await import("./route");

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/reports/report-1", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "report-1" }) };

describe("admin report scope moderation", () => {
  let project: { id: string; isPublic: boolean; coverUrl: string };
  let hold: { active: boolean; wasPublic: boolean; reportId: string } | null;
  let block: { blocked: boolean; reportId: string } | null;

  beforeEach(() => {
    vi.clearAllMocks();
    project = { id: "source", isPublic: true, coverUrl: "/api/assets?key=covers%2Fsource%2Fproject" };
    hold = null;
    block = null;
    mocks.getAdminSession.mockResolvedValue({ user: { id: "admin" } });
    mocks.reportFindUnique.mockResolvedValue({ id: "report-1", projectId: "source", revisionId: null, status: "OPEN" });
    mocks.revisionFindUnique.mockResolvedValue({ projectId: "source" });
    mocks.projectFindUnique.mockImplementation(async () => project);
    mocks.projectUpdate.mockImplementation(async ({ data }) => { project = { ...project, ...data }; return project; });
    mocks.holdFindUnique.mockImplementation(async () => hold);
    mocks.holdUpsert.mockImplementation(async ({ create, update }) => {
      hold = { ...hold, ...(hold ? update : create), active: true };
      return hold;
    });
    mocks.holdUpdate.mockImplementation(async ({ data }) => { hold = { ...hold!, ...data }; return hold; });
    mocks.assetFindUnique.mockImplementation(async () => block);
    mocks.assetUpsert.mockImplementation(async ({ create, update }) => { block = { ...block, ...(block ? update : create), blocked: true }; return block; });
    mocks.assetUpdate.mockImplementation(async ({ data }) => { block = { ...block!, ...data }; return block; });
    mocks.lock.mockResolvedValue([]);
    mocks.auditCreate.mockResolvedValue({ id: "event" });
    mocks.reportUpdate.mockResolvedValue({ id: "report-1", status: "RESOLVED" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.lock,
      report: { findUnique: mocks.reportFindUnique, update: mocks.reportUpdate },
      revision: { findUnique: mocks.revisionFindUnique },
      project: { findUnique: mocks.projectFindUnique, update: mocks.projectUpdate },
      moderationProjectHold: { findUnique: mocks.holdFindUnique, upsert: mocks.holdUpsert, update: mocks.holdUpdate },
      moderationAssetBlock: { findUnique: mocks.assetFindUnique, upsert: mocks.assetUpsert, update: mocks.assetUpdate },
      moderationEvent: { create: mocks.auditCreate },
    }));
  });

  it("hides only the reported project, not every project sharing its cover", async () => {
    const response = await PATCH(request({ status: "RESOLVED", hide: true }), params);
    expect(response.status).toBe(200);
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ where: { id: "source" }, data: { isPublic: false } });
    expect(mocks.holdUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.assetUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: { action: "HIDE_PROJECT", reportId: "report-1", projectId: "source", actorId: "admin" } });
  });

  it("blocks a shared cover without modifying project visibility", async () => {
    const response = await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params);
    expect(response.status).toBe(200);
    expect(project.isPublic).toBe(true);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
    expect(mocks.assetUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key: "covers/source/project" },
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BLOCK_COVER", assetKey: "covers/source/project" }) });
  });

  it("can lift a block from the report that created it", async () => {
    block = { blocked: true, reportId: "report-1" };
    const response = await PATCH(request({ action: "UNBLOCK_COVER" }), params);
    expect(response.status).toBe(200);
    expect(block?.blocked).toBe(false);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "UNBLOCK_COVER" }) });
  });

  it("rejects attempts to unblock a different report's block", async () => {
    block = { blocked: true, reportId: "other-report" };
    const response = await PATCH(request({ action: "UNBLOCK_COVER" }), params);
    expect(response.status).toBe(409);
    expect(mocks.assetUpdate).not.toHaveBeenCalled();
  });

  it("restores the original visibility from a project hold", async () => {
    project.isPublic = false;
    hold = { active: true, wasPublic: true, reportId: "report-1" };
    const response = await PATCH(request({ action: "RESTORE_PROJECT" }), params);
    expect(response.status).toBe(200);
    expect(project.isPublic).toBe(true);
    expect(mocks.holdUpdate).toHaveBeenCalledTimes(1);
  });

  it("never makes an originally private project public on restore", async () => {
    project.isPublic = false;
    hold = { active: true, wasPublic: false, reportId: "report-1" };
    const response = await PATCH(request({ action: "RESTORE_PROJECT" }), params);
    expect(response.status).toBe(200);
    expect(project.isPublic).toBe(false);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
  });

  it("rejects non-admin moderation and inconsistent status/action pairs", async () => {
    mocks.getAdminSession.mockResolvedValueOnce(null);
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params)).status).toBe(403);
    expect((await PATCH(request({ status: "DISMISSED", action: "BLOCK_COVER" }), params)).status).toBe(400);
    expect((await PATCH(request({ status: "RESOLVED", action: "INVALID" }), params)).status).toBe(400);
  });

  it("does not duplicate audit entries when the same block is requested again", async () => {
    block = { blocked: true, reportId: "report-1" };
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params)).status).toBe(200);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.assetUpsert).not.toHaveBeenCalled();
  });

  it("resolves a revision report against its owning project only", async () => {
    mocks.reportFindUnique.mockResolvedValue({ id: "report-1", projectId: null, revisionId: "rev-1" });
    expect((await PATCH(request({ status: "RESOLVED", action: "HIDE_PROJECT" }), params)).status).toBe(200);
    expect(mocks.revisionFindUnique).toHaveBeenCalled();
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ where: { id: "source" }, data: { isPublic: false } });
  });
});
