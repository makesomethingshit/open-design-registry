import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findDiscussion: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { discussion: { findFirst: mocks.findDiscussion } } }));

const { default: DiscussionPage } = await import("./page");

function discussion(isPublic = true, issues: Array<{ id: string; title: string; kind: "ISSUE" | "DESIGN_REQUEST"; status: "OPEN" | "CLOSED"; createdAt: Date }> = []) {
  return {
    id: "discussion", title: "Mobile navigation", body: "Keep the primary action visible.\nUse a short label.", createdAt: new Date("2026-09-12T00:00:00Z"),
    project: { slug: "demo", title: "Demo", ownerId: "owner", isPublic }, author: { name: "Jisoo" },
    issues,
    comments: [
      { id: "first", body: "Start with the current layout.", createdAt: new Date("2026-09-13T00:00:00Z"), author: { name: "Min" } },
      { id: "second", body: "Agreed, add a mobile check.", createdAt: new Date("2026-09-14T00:00:00Z"), author: { name: "Jisoo" } },
    ],
  };
}

async function markup(session: { user: { id: string } } | null, value = discussion()) {
  mocks.findDiscussion.mockResolvedValue(value);
  mocks.getSession.mockResolvedValue(session);
  return renderToStaticMarkup(await DiscussionPage({ params: Promise.resolve({ slug: "demo", id: "discussion" }) }));
}

describe("discussion detail page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders discussion body, title, and author", async () => {
    const html = await markup(null);
    expect(html).toContain("Mobile navigation");
    expect(html).toContain("Jisoo");
    expect(html).toContain("Keep the primary action visible.\nUse a short label.");
  });

  it("renders comments chronologically", async () => {
    const html = await markup(null);
    expect(html.indexOf("Start with the current layout.")).toBeLessThan(html.indexOf("Agreed, add a mobile check."));
    expect(mocks.findDiscussion).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ comments: { orderBy: { createdAt: "asc" }, include: expect.any(Object) }, issues: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, kind: true, status: true, createdAt: true } } }) }));
  });

  it("shows linked issues and design requests with their existing project anchors", async () => {
    const html = await markup(null, discussion(true, [
      { id: "issue-1", title: "Fix mobile navigation", kind: "ISSUE", status: "OPEN", createdAt: new Date("2026-09-13T00:00:00Z") },
      { id: "request-1", title: "Explore compact header", kind: "DESIGN_REQUEST", status: "CLOSED", createdAt: new Date("2026-09-14T00:00:00Z") },
    ]));

    expect(html).toContain("Resulting work");
    expect(html).toContain("Issue");
    expect(html).toContain("Design request");
    expect(html).toContain("Fix mobile navigation");
    expect(html).toContain("Explore compact header");
    expect(html).toContain("OPEN");
    expect(html).toContain("CLOSED");
    expect(html).toContain('href="/projects/demo/issues/issue-1"');
    expect(html).toContain('href="/projects/demo/issues/request-1"');
    expect(html.indexOf("Keep the primary action visible.")).toBeLessThan(html.indexOf("Resulting work"));
    expect(html.indexOf("Resulting work")).toBeLessThan(html.indexOf("Comments"));
  });

  it("shows the compact empty message when no work has been created", async () => {
    const html = await markup(null);
    expect(html).toContain("No work has been created from this discussion yet.");
  });

  it("shows only the creation actions allowed to each public-project visitor", async () => {
    const anonymous = await markup(null);
    expect(anonymous).not.toContain("Create issue");
    expect(anonymous).not.toContain("Create design request");

    const contributor = await markup({ user: { id: "contributor" } });
    expect(contributor).toContain("Create issue");
    expect(contributor).not.toContain("Create design request");

    const owner = await markup({ user: { id: "owner" } });
    expect(owner).toContain("Create issue");
    expect(owner).toContain("Create design request");
  });

  it("shows the comment form to signed-in readers of public projects", async () => {
    const html = await markup({ user: { id: "commenter" } });
    expect(html).toContain("Add a comment");
    expect(html).toContain('name="body"');
  });

  it("shows a login path and no form to anonymous readers", async () => {
    const html = await markup(null);
    expect(html).toContain("Sign in to add a comment");
    expect(html).not.toContain("<form");
  });

  it("returns 404 for a private discussion viewed by a non-owner", async () => {
    mocks.findDiscussion.mockResolvedValue(discussion(false));
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    await expect(DiscussionPage({ params: Promise.resolve({ slug: "demo", id: "discussion" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lets the private project owner view a discussion without a public comment form", async () => {
    mocks.findDiscussion.mockResolvedValue(discussion(false));
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const html = renderToStaticMarkup(await DiscussionPage({ params: Promise.resolve({ slug: "demo", id: "discussion" }) }));
    expect(html).toContain("Mobile navigation");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Create issue");
    expect(html).not.toContain("Create design request");
  });
});
