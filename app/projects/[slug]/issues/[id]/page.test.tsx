import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findFirst: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { issue: { findFirst: mocks.findFirst } } }));

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
  beforeEach(() => vi.clearAllMocks());

  it("shows request purpose, body, status, project, revision, and a related contribution link", async () => {
    const html = await markup(null);

    expect(html).toContain("Improve the mobile empty state");
    expect(html).toContain("Add a clear next step.\nKeep the message concise.");
    expect(html).toContain("Open");
    expect(html).toContain('href="/projects/demo">Design system</a>');
    expect(html).toContain('href="/projects/demo/revisions/7">Revision 7</a>');
    expect(html).toContain('href="/projects/demo/contribute?relatedIssue=request-1"');
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request-1", project: { slug: "demo" } } }));
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

  it("does not link an unpublished related revision", async () => {
    const hiddenRevision = issue();
    hiddenRevision.revision.isPublished = false;
    const html = await markup(null, hiddenRevision);

    expect(html).toContain("Revision 7");
    expect(html).not.toContain('href="/projects/demo/revisions/7"');
  });
});
