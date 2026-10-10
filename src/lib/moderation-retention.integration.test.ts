import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("./moderation", () => ({ getAdminSession: mocks.session }));
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { PATCH } = await import("@/app/api/admin/reports/[id]/route");
const { default: AdminReportsPage } = await import("@/app/admin/reports/page");
const db = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const decide = (id: string, action: string, note: string | null = "Verified synthetic violation") => PATCH(new Request("http://localhost/api/admin/reports/" + id, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "RESOLVED", action, ...(note === null ? {} : { resolutionNote: note }) }) }), { params: Promise.resolve({ id }) });
db("moderation decision retention in PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());
  it("lets administrators clear an inferred legacy hold without publishing the project", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: suffix, name: "Moderator", email: suffix + "@example.test" } });
    const project = await prisma.project.create({ data: { slug: suffix, title: "Legacy private", description: "", coverUrl: "", license: "MIT", ownerId: user.id, isPublic: false } });
    const reportId = "legacy-hide:" + project.id;
    mocks.session.mockResolvedValue({ user: { id: user.id } });
    try {
      await prisma.moderationProjectHold.create({ data: { projectId: project.id, reportId, wasPublic: false, hiddenById: "legacy-migration" } });
      await prisma.moderationEvent.create({ data: { action: "LEGACY_REVIEW_HOLD", reportId, projectId: project.id, actorId: "legacy-migration", reportReason: "Possible legacy hide", resolutionNote: "Unknown original visibility" } });
      const html = renderToStaticMarkup(await AdminReportsPage());
      expect(html).toContain("Unknown original visibility");
      expect(html).toContain("Restore project visibility");
      expect((await decide(reportId, "RESTORE_PROJECT", null)).status).toBe(200);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).isPublic).toBe(false);
      expect((await prisma.moderationProjectHold.findUniqueOrThrow({ where: { projectId: project.id } })).active).toBe(false);
      expect(await prisma.moderationEvent.findFirst({ where: { reportId, action: "RESTORE_PROJECT" } })).toMatchObject({ resolutionNote: "Unknown original visibility" });
    } finally {
      await prisma.moderationEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.moderationProjectHold.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
  it("retains review and dismissal events after deletion without reusing an earlier note", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: suffix, name: "Moderator", email: suffix + "@example.test" } });
    const project = await prisma.project.create({ data: { slug: suffix, title: "Audit target", description: "", coverUrl: "/api/assets?key=covers%2F" + suffix, license: "MIT", ownerId: user.id } });
    const reports = await Promise.all(["Reviewed", "Dismissed"].map(reason => prisma.report.create({ data: { projectId: project.id, reporterId: user.id, reason, details: "Retained detail" } })));
    mocks.session.mockResolvedValue({ user: { id: user.id } });
    try {
      expect((await decide(reports[0].id, "NONE", "Earlier review note")).status).toBe(200);
      expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "DISMISSED", action: "NONE", resolutionNote: "Dismissal note" }) }), { params: Promise.resolve({ id: reports[1].id }) })).status).toBe(200);
      expect((await decide(reports[0].id, "BLOCK_COVER", null)).status).toBe(200);
      expect((await prisma.report.findUniqueOrThrow({ where: { id: reports[0].id } })).resolutionNote).toBeNull();
      await prisma.report.deleteMany({ where: { id: { in: reports.map(r => r.id) } } });
      expect(await prisma.moderationEvent.findMany({ where: { reportId: { in: reports.map(r => r.id) } } })).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "REVIEW", resolutionNote: "Earlier review note", actorId: user.id }),
        expect.objectContaining({ action: "DISMISS", resolutionNote: "Dismissal note", actorId: user.id }),
        expect.objectContaining({ action: "BLOCK_COVER", resolutionNote: "", reportDetails: "Retained detail" }),
      ]));
    } finally {
      await prisma.moderationEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.moderationAssetBlock.deleteMany({ where: { reportId: { in: reports.map(r => r.id) } } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("shows each retained active decision, not an unrelated newer restoration note", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: suffix, name: "Moderator", email: suffix + "@example.test" } });
    const project = await prisma.project.create({ data: { slug: suffix, title: "Audit scope", description: "", coverUrl: "", license: "MIT", ownerId: user.id, isPublic: false } });
    const coverReportId = "retained-cover-" + suffix;
    const hideReportId = "retained-hide-" + suffix;
    const keyA = "covers/" + suffix + "/a";
    const keyB = "covers/" + suffix + "/b";
    const oldTime = new Date("2026-10-01T10:00:00.000Z");
    const decisionTime = new Date("2026-10-01T11:00:00.000Z");
    const laterTime = new Date("2026-10-01T12:00:00.000Z");
    try {
      await prisma.moderationProjectHold.create({ data: { projectId: project.id, reportId: hideReportId, hiddenById: user.id, wasPublic: true } });
      await prisma.moderationAssetBlock.createMany({ data: [
        { key: keyA, reportId: coverReportId, blockedById: user.id, reason: "Cover A active reason" },
        { key: keyB, reportId: coverReportId, blockedById: user.id, reason: "Cover B active reason" },
      ] });
      await prisma.moderationEvent.createMany({ data: [
        { reportId: coverReportId, actorId: user.id, action: "HIDE_PROJECT", projectId: project.id, resolutionNote: "Old hidden project", createdAt: oldTime },
        { reportId: coverReportId, actorId: user.id, action: "BLOCK_COVER", assetKey: keyA, reportReason: "Reported content", reportDetails: "Original cover details", resolutionNote: "Cover A active reason", createdAt: decisionTime },
        { reportId: coverReportId, actorId: user.id, action: "BLOCK_COVER", assetKey: keyB, reportReason: "Reported content", reportDetails: "Original cover details", resolutionNote: "Cover B active reason", createdAt: decisionTime },
        { reportId: coverReportId, actorId: user.id, action: "RESTORE_PROJECT", projectId: project.id, resolutionNote: "Unrelated project restore note", createdAt: laterTime },
        { reportId: hideReportId, actorId: user.id, action: "HIDE_PROJECT", projectId: project.id, reportReason: "Reported private project", resolutionNote: "Actual active project hide note", createdAt: oldTime },
        { reportId: hideReportId, actorId: user.id, action: "BLOCK_COVER", assetKey: "covers/" + suffix + "/restored", resolutionNote: "Older unrelated cover note", createdAt: decisionTime },
        { reportId: hideReportId, actorId: user.id, action: "UNBLOCK_COVER", assetKey: "covers/" + suffix + "/restored", resolutionNote: "Unrelated cover unblock note", createdAt: laterTime },
      ] });
      const html = renderToStaticMarkup(await AdminReportsPage());
      expect(html).toContain("Reported content");
      expect(html).toContain("Original cover details");
      expect(html).toContain("Cover A active reason");
      expect(html).toContain("Cover B active reason");
      expect(html).toContain(keyA);
      expect(html).toContain(keyB);
      expect(html).toContain("Reported private project");
      expect(html).toContain("Actual active project hide note");
      expect(html).not.toContain("Unrelated project restore note");
      expect(html).not.toContain("Unrelated cover unblock note");
      expect(html).not.toContain("Older unrelated cover note");
    } finally {
      await prisma.moderationEvent.deleteMany({ where: { reportId: { in: [coverReportId, hideReportId] } } });
      await prisma.moderationAssetBlock.deleteMany({ where: { reportId: coverReportId } });
      await prisma.moderationProjectHold.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
  it("does not silently resolve a duplicate hide and restores after reporter deletion", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: suffix, name: "Reporter", email: suffix + "@example.test" } });
    const owner = await prisma.user.create({ data: { id: "owner-" + suffix, name: "Owner", email: "owner-" + suffix + "@example.test" } });
    const project = await prisma.project.create({ data: { slug: suffix, title: "Target", description: "", coverUrl: "/api/assets?key=covers%2Ftest%2Fshared", license: "MIT", ownerId: owner.id } });
    const reports = await Promise.all(["A", "B"].map(reason => prisma.report.create({ data: { projectId: project.id, reporterId: user.id, reason, details: "Original report detail" } })));
    mocks.session.mockResolvedValue({ user: { id: owner.id } });
    try {
      expect((await decide(reports[0].id, "HIDE_PROJECT")).status).toBe(200);
      expect((await decide(reports[1].id, "HIDE_PROJECT")).status).toBe(409);
      expect((await prisma.report.findUniqueOrThrow({ where: { id: reports[1].id } })).status).toBe("OPEN");
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).isPublic).toBe(false);
      expect((await decide(reports[0].id, "RESTORE_PROJECT")).status).toBe(200);
      const raced = await Promise.all(reports.map(report => decide(report.id, "HIDE_PROJECT")));
      expect(raced.map(response => response.status).sort()).toEqual([200, 409]);
      const activeReportId = reports[raced.findIndex(response => response.status === 200)].id;
      expect(await prisma.moderationProjectHold.count({ where: { projectId: project.id, active: true } })).toBe(1);
      await prisma.user.delete({ where: { id: user.id } });
      expect(await prisma.report.count({ where: { id: { in: reports.map(r => r.id) } } })).toBe(0);
      const html = renderToStaticMarkup(await AdminReportsPage());
      expect(html).toContain("Retained decisions with deleted reports");
      expect(html).toContain("Original report detail");
      expect(html).toContain("Restore project visibility");
      expect((await decide(activeReportId, "RESTORE_PROJECT")).status).toBe(200);
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).isPublic).toBe(true);
    } finally {
      await prisma.moderationEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.moderationProjectHold.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.deleteMany({ where: { id: { in: [user.id, owner.id] } } });
    }
  });
  it("unblocks the retained original object after report deletion and a cover change", async () => {
    const suffix = crypto.randomUUID();
    const user = await prisma.user.create({ data: { id: suffix, name: "Reporter", email: suffix + "@example.test" } });
    const project = await prisma.project.create({ data: { slug: suffix, title: "Target", description: "", coverUrl: "/api/assets?key=covers%2F" + suffix, license: "MIT", ownerId: user.id } });
    const report = await prisma.report.create({ data: { projectId: project.id, reporterId: user.id, reason: "Copyright", details: "Synthetic original reason" } });
    mocks.session.mockResolvedValue({ user: { id: user.id } });
    try {
      expect((await decide(report.id, "BLOCK_COVER")).status).toBe(200);
      await prisma.project.update({ where: { id: project.id }, data: { coverUrl: "/api/assets?key=covers%2F" + suffix + "-second" } });
      expect((await decide(report.id, "BLOCK_COVER", "Second object decision")).status).toBe(200);
      expect(await prisma.moderationAssetBlock.count({ where: { reportId: report.id, blocked: true } })).toBe(2);
      await prisma.project.update({ where: { id: project.id }, data: { coverUrl: "/api/assets?key=covers%2Freplacement" } });
      await prisma.report.delete({ where: { id: report.id } });
      const html = renderToStaticMarkup(await AdminReportsPage());
      expect(html).toContain("Copyright");
      expect(html).toContain("Synthetic original reason");
      expect(html).toContain("covers/" + suffix);
      expect(html).toContain("Lift this report&#x27;s asset blocks");
      expect((await decide(report.id, "UNBLOCK_COVER", null)).status).toBe(200);
      expect(await prisma.moderationEvent.findMany({ where: { reportId: report.id } })).toEqual(expect.arrayContaining([expect.objectContaining({ action: "BLOCK_COVER", reportReason: "Copyright", reportDetails: "Synthetic original reason", resolutionNote: "Verified synthetic violation" }), expect.objectContaining({ action: "UNBLOCK_COVER", reportReason: "Copyright", reportDetails: "Synthetic original reason" })]));
      const restored = await prisma.moderationEvent.findMany({ where: { reportId: report.id, action: "UNBLOCK_COVER" } });
      expect(restored).toEqual(expect.arrayContaining([
        expect.objectContaining({ assetKey: "covers/" + suffix, resolutionNote: "Verified synthetic violation" }),
        expect.objectContaining({ assetKey: "covers/" + suffix + "-second", resolutionNote: "Second object decision" }),
      ]));
      expect(await prisma.moderationAssetBlock.count({ where: { reportId: report.id, blocked: true } })).toBe(0);
      expect((await prisma.moderationAssetBlock.findUniqueOrThrow({ where: { key_reportId: { key: "covers/" + suffix, reportId: report.id } } })).blocked).toBe(false);
    } finally {
      await prisma.moderationEvent.deleteMany({ where: { reportId: report.id } });
      await prisma.moderationAssetBlock.deleteMany({ where: { reportId: report.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
