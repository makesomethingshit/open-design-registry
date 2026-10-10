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
  type Block = { key: string; blocked: boolean; reportId: string };
  let blocks: Map<string, Block>;
  const blockId = (key: string, reportId: string) => `${key}:${reportId}`;
  const coverKey = "covers/source/project";

  beforeEach(() => {
    vi.clearAllMocks();
    project = { id: "source", isPublic: true, coverUrl: "/api/assets?key=covers%2Fsource%2Fproject" };
    hold = null;
    blocks = new Map();
    mocks.getAdminSession.mockResolvedValue({ user: { id: "admin" } });
    mocks.reportFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      ({ id: where.id, projectId: "source", revisionId: null, status: "OPEN", reason: "Synthetic violation", details: "Original reason" })
    );
    mocks.revisionFindUnique.mockResolvedValue({ projectId: "source" });
    mocks.projectFindUnique.mockImplementation(async () => project);
    mocks.projectUpdate.mockImplementation(async ({ data }) => { project = { ...project, ...data }; return project; });
    mocks.holdFindUnique.mockImplementation(async () => hold);
    mocks.holdUpsert.mockImplementation(async ({ create, update }) => {
      hold = { ...hold, ...(hold ? update : create), active: true };
      return hold;
    });
    mocks.holdUpdate.mockImplementation(async ({ data }) => { hold = { ...hold!, ...data }; return hold; });
    mocks.assetFindUnique.mockImplementation(async ({ where }: { where: { key_reportId: { key: string; reportId: string } } }) => {
      const { key, reportId } = where.key_reportId;
      return blocks.get(blockId(key, reportId)) ?? null;
    });
    mocks.assetUpsert.mockImplementation(async ({ where, create, update }: {
      where: { key_reportId: { key: string; reportId: string } };
      create: Block;
      update: Partial<Block>;
    }) => {
      const { key, reportId } = where.key_reportId;
      const k = blockId(key, reportId);
      const current = blocks.get(k);
      const row = { ...(current ?? create), ...(current ? update : {}), key, reportId, blocked: true };
      blocks.set(k, row);
      return row;
    });
    mocks.assetUpdate.mockImplementation(async ({ where, data }: {
      where: { key_reportId: { key: string; reportId: string } };
      data: Partial<Block>;
    }) => {
      const { key, reportId } = where.key_reportId;
      const k = blockId(key, reportId);
      const row = { ...blocks.get(k)!, ...data };
      blocks.set(k, row);
      return row;
    });
    mocks.lock.mockResolvedValue([]);
    mocks.auditCreate.mockResolvedValue({ id: "event" });
    mocks.reportUpdate.mockResolvedValue({ id: "report-1", status: "RESOLVED" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      $queryRaw: mocks.lock,
      report: { findUnique: mocks.reportFindUnique, update: mocks.reportUpdate },
      revision: { findUnique: mocks.revisionFindUnique },
      project: { findUnique: mocks.projectFindUnique, update: mocks.projectUpdate, updateMany: mocks.projectUpdate },
      moderationProjectHold: { findFirst: async ({ where }: { where: { reportId: string } }) => hold?.active && hold.reportId === where.reportId ? { ...hold, projectId: "source" } : null, findUnique: mocks.holdFindUnique, upsert: mocks.holdUpsert, update: mocks.holdUpdate },
      moderationAssetBlock: { findMany: async ({ where }: { where: { reportId: string } }) => [...blocks.values()].filter(block => block.reportId === where.reportId && block.blocked), findUnique: mocks.assetFindUnique, upsert: mocks.assetUpsert, update: mocks.assetUpdate },
      moderationEvent: { create: mocks.auditCreate, findFirst: vi.fn().mockResolvedValue(null) },
    }));
  });

  it("hides only the reported project, not every project sharing its cover", async () => {
    const response = await PATCH(request({ status: "RESOLVED", hide: true }), params);
    expect(response.status).toBe(200);
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ where: { id: "source" }, data: { isPublic: false } });
    expect(mocks.holdUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.assetUpsert).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "HIDE_PROJECT", reportId: "report-1", projectId: "source", actorId: "admin", reportReason: "Synthetic violation", reportDetails: "Original reason" }) });
  });

  it("blocks a shared cover without modifying project visibility", async () => {
    const response = await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params);
    expect(response.status).toBe(200);
    expect(project.isPublic).toBe(true);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
    expect(mocks.assetUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { key_reportId: { key: "covers/source/project", reportId: "report-1" } },
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "BLOCK_COVER", assetKey: "covers/source/project" }) });
  });

  it("can lift a block from the report that created it", async () => {
    blocks.set(blockId(coverKey, "report-1"), { key: coverKey, blocked: true, reportId: "report-1" });
    const response = await PATCH(request({ action: "UNBLOCK_COVER" }), params);
    expect(response.status).toBe(200);
    expect(blocks.get(blockId(coverKey, "report-1"))?.blocked).toBe(false);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "UNBLOCK_COVER" }) });
  });

  it("rejects attempts to unblock a different report's block", async () => {
    blocks.set(blockId(coverKey, "other-report"), { key: coverKey, blocked: true, reportId: "other-report" });
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
    blocks.set(blockId(coverKey, "report-1"), { key: coverKey, blocked: true, reportId: "report-1" });
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params)).status).toBe(200);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.assetUpsert).not.toHaveBeenCalled();
  });

  it("keeps a shared asset suppressed until every report releases its own block", async () => {
    const second = { params: Promise.resolve({ id: "report-2" }) };
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params)).status).toBe(200);
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), second)).status).toBe(200);
    expect(blocks.size).toBe(2);
    expect([...blocks.values()].filter((row) => row.blocked)).toHaveLength(2);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(2);

    expect((await PATCH(request({ action: "UNBLOCK_COVER" }), params)).status).toBe(200);
    expect(blocks.get(blockId(coverKey, "report-1"))?.blocked).toBe(false);
    expect(blocks.get(blockId(coverKey, "report-2"))?.blocked).toBe(true);

    expect((await PATCH(request({ action: "UNBLOCK_COVER" }), second)).status).toBe(200);
    expect([...blocks.values()].some((row) => row.blocked)).toBe(false);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(4);
  });

  it("does not duplicate block claims or audit entries on retries", async () => {
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params)).status).toBe(200);
    expect((await PATCH(request({ status: "RESOLVED", action: "BLOCK_COVER" }), params)).status).toBe(200);
    expect(blocks.size).toBe(1);
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("resolves a revision report against its owning project only", async () => {
    mocks.reportFindUnique.mockResolvedValue({ id: "report-1", projectId: null, revisionId: "rev-1" });
    expect((await PATCH(request({ status: "RESOLVED", action: "HIDE_PROJECT" }), params)).status).toBe(200);
    expect(mocks.revisionFindUnique).toHaveBeenCalled();
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ where: { id: "source" }, data: { isPublic: false } });
  });

  it("rejects a second report hide without resolving it or replacing the first decision", async () => {
    expect((await PATCH(request({ status: "RESOLVED", action: "HIDE_PROJECT" }), params)).status).toBe(200);
    mocks.reportUpdate.mockClear();
    const response = await PATCH(request({ status: "RESOLVED", action: "HIDE_PROJECT" }), { params: Promise.resolve({ id: "report-2" }) });
    expect(response.status).toBe(409);
    expect(hold?.reportId).toBe("report-1");
    expect(project.isPublic).toBe(false);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledTimes(1);
  });

});
