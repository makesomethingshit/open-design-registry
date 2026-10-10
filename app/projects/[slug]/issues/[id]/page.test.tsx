import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findFirst: vi.fn(), transaction: vi.fn(), readParticipation: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/src/lib/design-request-participation", () => ({ readDesignRequestParticipationSnapshot: mocks.readParticipation }));

const { default: IssuePage } = await import("./page");

function issue(isPublic = true, status: "OPEN" | "CLOSED" = "OPEN") {
  return {
    id: "request-1",
    title: "Improve the mobile empty state",
    body: "Add a clear next step.\nKeep the message concise.",
    kind: "DESIGN_REQUEST",
    status,
    createdAt: new Date("2026-09-12T00:00:00Z"),
    author: { name: "Mina" },
    project: { title: "Design system", ownerId: "owner", isPublic },
    revision: { number: 7, isPublished: true },
  };
}

async function markup(session: { user: { id: string } } | null, value = issue()) {
  mocks.findFirst.mockResolvedValue(value);
  mocks.getSession.mockResolvedValue(session);
  return renderToStaticMarkup(await IssuePage({ params: Promise.resolve({ slug: "demo", id: "request-1" }) }));
}

describe("project issue detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ issue: { findFirst: mocks.findFirst } }));
    mocks.readParticipation.mockResolvedValue({ count: 0, names: [], participating: false });
  });

  it("shows request purpose, body, status, project, revision, and a related contribution link", async () => {
    const html = await markup(null);

    expect(html).toContain("Improve the mobile empty state");
    expect(html).toContain("Add a clear next step.\nKeep the message concise.");
    expect(html).toContain("Open");
    expect(html).toContain('href="/projects/demo">Design system</a>');
    expect(html).toContain('href="/projects/demo/revisions/7">Revision 7</a>');
    expect(html).toContain('href="/projects/demo/contribute?relatedIssue=request-1"');
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request-1", project: { slug: "demo" } } }));
    expect(html).toContain("Working interest");
    expect(html).toContain("Sign in to participate");
    expect(html).toContain("next=%2Fprojects%2Fdemo%2Fissues%2Frequest-1");
  });

  it("shows stable participant names, count, own state, and the public-name notice", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "participant" } });
    mocks.readParticipation.mockResolvedValue({ count: 6, names: ["Ari", "Bo", "Cy", "Dee", "Eli"], participating: true });
    const html = await markup({ user: { id: "participant" } });

    expect(html).toContain("6 people are working on this: Ari, Bo, Cy, Dee, Eli and 1 more.");
    expect(html).toContain("Stop working on this");
    expect(html).toContain("Your display name will be visible to visitors");
    expect(html).not.toContain("@example");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "RepeatableRead" });
  });

  it("keeps closed issues readable without offering contribution", async () => {
    const html = await markup(null, issue(true, "CLOSED"));

    expect(html).toContain("Closed");
    expect(html).not.toContain("Contribute to this request");
  });

  it("hides private project issues from non-owners", async () => {
    mocks.findFirst.mockResolvedValue(issue(false));
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });

    await expect(IssuePage({ params: Promise.resolve({ slug: "demo", id: "request-1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("keeps comments and owner controls in detail while hiding private proposal metadata", async () => {
    const value = { ...issue(), comments: [{ id: "comment", body: "A useful comment", author: { name: "Commenter" } }], proposals: [{ id: "hidden", proposalNumber: 8, title: "Private proposed work", status: "OPEN", project: { id: "project", ownerId: "owner", isPublic: true }, baseRevision: { projectId: "project", isPublished: true }, sourceRevision: { isPublished: true, project: { ownerId: "other-owner", isPublic: false } }, appliedRevisions: [] }] };
    const html = await markup({ user: { id: "owner" } }, value);
    expect(html).toContain("A useful comment");
    expect(html).toContain("Comment on Improve the mobile empty state");
    expect(html).toContain("Close issue");
    expect(html).not.toContain("Private proposed work");
    expect(html).not.toContain("Open an issue");
    const visitor = await markup(null, value);
    expect(visitor).not.toContain("Private proposed work");
    expect(visitor).not.toContain("Comment on Improve the mobile empty state");
  });

  it("does not link an unpublished related revision", async () => {
    const hiddenRevision = issue();
    hiddenRevision.revision.isPublished = false;
    const html = await markup(null, hiddenRevision);

    expect(html).toContain("Revision 7");
    expect(html).not.toContain('href="/projects/demo/revisions/7"');
  });
});
