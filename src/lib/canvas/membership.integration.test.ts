import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../prisma";
import { applyForCanvas, canvasView, changeCanvasAccess, readCanvases } from "./service";
import { canvasRequest } from "./handlers";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("../auth", () => ({ auth: { api: { getSession: async () => session.userId ? { user: { id: session.userId } } : null } } }));
const db = process.env.RUN_PROPOSAL_CONCURRENCY_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;

db("Canvas membership PostgreSQL production paths", () => {
  let ownerId: string, contributorId: string, strangerId: string, projectId: string, slug: string;
  beforeEach(async () => {
    const suffix = crypto.randomUUID();
    [ownerId, contributorId, strangerId] = ["owner", "contributor", "stranger"].map((role) => `canvas-${role}-${suffix}`);
    for (const [id, name] of [[ownerId, "Project owner"], [contributorId, "Canvas designer"], [strangerId, "Other designer"]] as const) await prisma.user.create({ data: { id, email: `${id}@example.test`, name } });
    slug = `canvas-${suffix}`;
    projectId = (await prisma.project.create({ data: { slug, title: "Canvas", description: "", license: "MIT", coverUrl: "", ownerId, isPublic: true } })).id;
    session.userId = null;
  });
  afterEach(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, contributorId, strangerId] } } });
  });

  it("auto-approves the Project owner's own Canvas and preserves its identity on reactivation", async () => {
    const own = await applyForCanvas(slug, ownerId);
    expect(own.accessStatus).toBe("APPROVED");
    expect(own.approvedById).toBe(ownerId);
    expect(own.approvedAt).not.toBeNull();
    expect(own.firstApprovedAt).not.toBeNull();
    expect((await applyForCanvas(slug, ownerId)).id).toBe(own.id);

    await changeCanvasAccess(slug, own.id, ownerId, "withdraw");
    const again = await applyForCanvas(slug, ownerId);
    expect(again.id).toBe(own.id);
    expect(again.accessStatus).toBe("APPROVED");
    expect(again.firstApprovedAt).toEqual(own.firstApprovedAt);
    expect(await prisma.projectCanvas.count({ where: { projectId, ownerId } })).toBe(1);

    const contributor = await applyForCanvas(slug, contributorId);
    expect(contributor.accessStatus).toBe("PENDING");
  });

  it("serializes concurrent first applications and preserves identity/history on reapplication", async () => {
    const [first, second] = await Promise.all([applyForCanvas(slug, contributorId), applyForCanvas(slug, contributorId)]);
    expect(first.id).toBe(second.id);
    expect(await prisma.projectCanvas.count({ where: { projectId } })).toBe(1);
    const approved = await changeCanvasAccess(slug, first.id, ownerId, "approve");
    await changeCanvasAccess(slug, first.id, contributorId, "withdraw");
    const again = await applyForCanvas(slug, contributorId);
    expect(again.id).toBe(first.id);
    expect(again.accessStatus).toBe("PENDING");
    expect(again.firstApprovedAt).toEqual(approved.firstApprovedAt);
    expect(await readCanvases(slug, null, first.id)).toHaveLength(1);
  });

  it("serializes approve/reject competitors and reports the stale transition", async () => {
    const canvas = await applyForCanvas(slug, contributorId);
    const results = await Promise.allSettled([changeCanvasAccess(slug, canvas.id, ownerId, "approve"), changeCanvasAccess(slug, canvas.id, ownerId, "reject")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  });

  it("reads fresh project ownership and private state after a competing transaction", async () => {
    const canvas = await applyForCanvas(slug, contributorId);
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const ready = new Promise<void>((r) => { locked = r; });
    const transfer = prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { ownerId: strangerId } });
      locked(); await gate;
    });
    await ready;
    const approval = changeCanvasAccess(slug, canvas.id, ownerId, "approve");
    const checked = expect(approval).rejects.toMatchObject({ status: 403 });
    release(); await transfer; await checked;
    await prisma.project.update({ where: { id: projectId }, data: { isPublic: false } });
    await expect(applyForCanvas(slug, strangerId)).rejects.toThrow("no longer public");
  });

  it("enforces HTTP authentication, hidden applications, strict input and moderation ownership", async () => {
    expect((await canvasRequest(new Request("http://localhost", { method: "POST" }), { slug })).status).toBe(401);
    const canvas = await applyForCanvas(slug, contributorId);
    expect((await canvasRequest(new Request("http://localhost"), { slug, canvasId: canvas.id })).status).toBe(404);
    session.userId = strangerId;
    const patch = (body: unknown) => canvasRequest(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), { slug, canvasId: canvas.id });
    expect((await patch({ action: "approve", ownerId: strangerId })).status).toBe(400);
    expect((await patch({ action: "approve" })).status).toBe(403);
    session.userId = ownerId;
    expect((await patch({ action: "approve" })).status).toBe(200);
  });

  it("projects private first applications and public retained approval history without leaking account metadata", async () => {
    const canvas = await applyForCanvas(slug, contributorId);
    const pending = (await readCanvases(slug, contributorId, canvas.id))[0];
    const applicantView = canvasView(pending, contributorId);
    expect(applicantView).toMatchObject({ accessStatus: "PENDING", isOwnCanvas: true, canWithdraw: true, canReapply: false });
    expect(applicantView).not.toHaveProperty("ownerId");
    expect(applicantView).not.toHaveProperty("email");

    session.userId = null;
    const publicPendingList = await canvasRequest(new Request("http://localhost"), { slug });
    expect(publicPendingList.status).toBe(200);
    expect(await publicPendingList.json()).toEqual([]);
    session.userId = ownerId;
    const ownerPending = await (await canvasRequest(new Request("http://localhost"), { slug })).json();
    expect(ownerPending.find((row: { id: string }) => row.id === canvas.id)).toMatchObject({ id: canvas.id, ownerName: "Canvas designer", accessStatus: "PENDING", firstApprovedAt: null, canManage: true });
    expect(JSON.stringify(ownerPending)).not.toContain(`${contributorId}@example.test`);
    expect(JSON.stringify(ownerPending)).not.toContain('"ownerId"');

    await changeCanvasAccess(slug, canvas.id, ownerId, "reject");
    session.userId = contributorId;
    const rejected = await (await canvasRequest(new Request("http://localhost"), { slug, canvasId: canvas.id })).json();
    expect(rejected).toMatchObject({ accessStatus: "REJECTED", firstApprovedAt: null, canReapply: true });
    session.userId = null;
    const privateRejectedList = await (await canvasRequest(new Request("http://localhost"), { slug })).json();
    expect(privateRejectedList).toEqual([]);
    expect((await canvasRequest(new Request("http://localhost"), { slug, canvasId: canvas.id })).status).toBe(404);
    session.userId = contributorId;
    expect((await applyForCanvas(slug, contributorId)).accessStatus).toBe("PENDING");
    await changeCanvasAccess(slug, canvas.id, contributorId, "withdraw");
    const withdrawn = canvasView((await readCanvases(slug, contributorId, canvas.id))[0], contributorId);
    expect(withdrawn).toMatchObject({ accessStatus: "REVOKED", firstApprovedAt: null, canReapply: true, canEdit: false, canComment: false });

    session.userId = ownerId;
    expect((await applyForCanvas(slug, ownerId)).accessStatus).toBe("APPROVED");
    session.userId = contributorId;
    expect((await applyForCanvas(slug, contributorId)).accessStatus).toBe("PENDING");
    session.userId = ownerId;
    await changeCanvasAccess(slug, canvas.id, ownerId, "approve");
    const firstApproval = (await readCanvases(slug, contributorId, canvas.id))[0].firstApprovedAt;
    await changeCanvasAccess(slug, canvas.id, ownerId, "revoke");
    session.userId = null;
    const publicHistory = await (await canvasRequest(new Request("http://localhost"), { slug, canvasId: canvas.id })).json();
    expect(publicHistory).toMatchObject({ accessStatus: "REVOKED", firstApprovedAt: firstApproval?.toISOString(), canEdit: false, canComment: false, canManage: false });
    expect(JSON.stringify(publicHistory)).not.toContain(`${contributorId}@example.test`);
    expect(JSON.stringify(publicHistory)).not.toContain('"ownerId"');

    session.userId = contributorId;
    const reapplication = await applyForCanvas(slug, contributorId);
    const retained = (await readCanvases(slug, contributorId, canvas.id))[0];
    expect(reapplication.accessStatus).toBe("PENDING");
    expect(canvasView(retained, contributorId)).toMatchObject({ accessStatus: "PENDING", firstApprovedAt: firstApproval?.toISOString(), isOwnCanvas: true, canEdit: false, canComment: false, canWithdraw: true });
    session.userId = null;
    const publicPendingHistory = await (await canvasRequest(new Request("http://localhost"), { slug, canvasId: canvas.id })).json();
    expect(publicPendingHistory).toMatchObject({ accessStatus: "REVOKED", firstApprovedAt: firstApproval?.toISOString(), canEdit: false, canComment: false });
  });

  it("retains approved contribution identity anonymously after contributor deletion", async () => {
    const canvas = await applyForCanvas(slug, contributorId);
    await changeCanvasAccess(slug, canvas.id, ownerId, "approve");
    await prisma.user.delete({ where: { id: contributorId } });
    expect((await readCanvases(slug, null, canvas.id))[0].ownerId).toBeNull();
    await expect(changeCanvasAccess(slug, canvas.id, strangerId, "withdraw")).rejects.toMatchObject({ status: 403 });
  });
  it("requires ownership transfer before deleting a Project owner with public Canvas history", async () => {
    const canvas = await applyForCanvas(slug, contributorId);
    await changeCanvasAccess(slug, canvas.id, ownerId, "approve");
    await expect(prisma.user.delete({ where: { id: ownerId } })).rejects.toMatchObject({ code: "P2003" });
    expect(await prisma.projectCanvas.findUnique({ where: { id: canvas.id } })).not.toBeNull();
    await prisma.project.update({ where: { id: projectId }, data: { ownerId: strangerId } });
    await prisma.user.delete({ where: { id: ownerId } });
    expect(await readCanvases(slug, null, canvas.id)).toHaveLength(1);
  });
});
