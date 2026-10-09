import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  lockIssue: vi.fn(),
  issueFindUnique: vi.fn(),
  participationFindUnique: vi.fn(),
  participationCreate: vi.fn(),
  participationDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./issue-handlers", () => ({ lockIssue: mocks.lockIssue }));
vi.mock("./prisma", () => ({ prisma: {
  $transaction: mocks.transaction,
} }));

const { deleteDesignRequestParticipation, postDesignRequestParticipation } = await import("./design-request-participation");

const request = new Request("http://localhost/api/issues/issue/participation");
let issue: { kind: "ISSUE" | "DESIGN_REQUEST"; status: "OPEN" | "CLOSED"; project: { isPublic: boolean } };
let participantIds: Set<string>;

function setup() {
  issue = { kind: "DESIGN_REQUEST", status: "OPEN", project: { isPublic: true } };
  participantIds = new Set();
  mocks.getSession.mockResolvedValue({ user: { id: "user-a" } });
  mocks.lockIssue.mockResolvedValue(undefined);
  mocks.issueFindUnique.mockImplementation(async () => issue);
  mocks.participationFindUnique.mockImplementation(async ({ where }: { where: { issueId_userId: { userId: string } } }) => participantIds.has(where.issueId_userId.userId) ? { issueId: "issue" } : null);
  mocks.participationCreate.mockImplementation(async ({ data }: { data: { userId: string } }) => { participantIds.add(data.userId); return { issueId: "issue", userId: data.userId }; });
  mocks.participationDeleteMany.mockImplementation(async ({ where }: { where: { userId: string } }) => { const deleted = participantIds.delete(where.userId); return { count: deleted ? 1 : 0 }; });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    issue: { findUnique: mocks.issueFindUnique },
    designRequestParticipation: { findUnique: mocks.participationFindUnique, create: mocks.participationCreate, deleteMany: mocks.participationDeleteMany },
  }));
}

describe("design request participation handlers", () => {
  beforeEach(() => { vi.clearAllMocks(); setup(); });

  it("requires authentication before opening a transaction", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await postDesignRequestParticipation(request, { id: "issue" })).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates one participation and makes repeated POST idempotent", async () => {
    expect((await postDesignRequestParticipation(request, { id: "issue" })).status).toBe(201);
    expect((await postDesignRequestParticipation(request, { id: "issue" })).status).toBe(200);
    expect(participantIds).toEqual(new Set(["user-a"]));
    expect(mocks.participationCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ISSUE", "OPEN", true, 404],
    ["DESIGN_REQUEST", "CLOSED", true, 409],
    ["DESIGN_REQUEST", "OPEN", false, 404],
  ] as const)("returns %s/%s/public=%s as %s", async (kind, status, isPublic, expected) => {
    issue = { kind, status, project: { isPublic } };
    expect((await postDesignRequestParticipation(request, { id: "issue" })).status).toBe(expected);
    expect(mocks.participationCreate).not.toHaveBeenCalled();
  });

  it("only deletes the current user and repeated DELETE is a 204", async () => {
    participantIds = new Set(["user-a", "user-b"]);
    expect((await deleteDesignRequestParticipation(request, { id: "issue" })).status).toBe(204);
    expect((await deleteDesignRequestParticipation(request, { id: "issue" })).status).toBe(204);
    expect(participantIds).toEqual(new Set(["user-b"]));
  });

  it("lets an existing participant withdraw after the project becomes private", async () => {
    participantIds = new Set(["user-a", "user-b"]);
    issue.project.isPublic = false;
    expect((await deleteDesignRequestParticipation(request, { id: "issue" })).status).toBe(204);
    expect(participantIds).toEqual(new Set(["user-b"]));
  });

  it("allows idempotent withdrawal after close as specified by the DELETE contract", async () => {
    issue.status = "CLOSED";
    expect((await deleteDesignRequestParticipation(request, { id: "issue" })).status).toBe(204);
    expect(participantIds.size).toBe(0);
  });

  it("hides normal and private issues from DELETE", async () => {
    issue = { kind: "ISSUE", status: "OPEN", project: { isPublic: true } };
    expect((await deleteDesignRequestParticipation(request, { id: "issue" })).status).toBe(404);
    issue = { kind: "DESIGN_REQUEST", status: "OPEN", project: { isPublic: false } };
    expect((await deleteDesignRequestParticipation(request, { id: "issue" })).status).toBe(404);
    expect(mocks.participationDeleteMany).not.toHaveBeenCalled();
  });
});
