import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findRevision: vi.fn(), createReport: vi.fn() }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { revision: { findUnique: mocks.findRevision }, report: { create: mocks.createReport } } }));
const { POST } = await import("./route");

describe("report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "reporter" } });
    mocks.findRevision.mockResolvedValue({ id: "revision-1", project: { isPublic: true } });
    mocks.createReport.mockResolvedValue({ id: "report-1", revisionId: "revision-1" });
  });

  it("creates a revision report when only revisionId is supplied", async () => {
    const response = await POST(new Request("http://localhost/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revisionId: "revision-1", reason: "Copyright concern" }) }));
    expect(response.status).toBe(201);
    expect(mocks.createReport).toHaveBeenCalledWith({ data: { revisionId: "revision-1", reporterId: "reporter", reason: "Copyright concern", details: "" } });
  });
});
