import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findDiscussion: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { discussion: { findFirst: mocks.findDiscussion } } }));

const { default: DiscussionPage } = await import("./page");

function discussion(isPublic = true) {
  return {
    id: "discussion", title: "Mobile navigation", body: "Keep the primary action visible.\nUse a short label.", createdAt: new Date("2026-09-12T00:00:00Z"),
    project: { slug: "demo", title: "Demo", ownerId: "owner", isPublic }, author: { name: "Jisoo" },
    comments: [
      { id: "first", body: "Start with the current layout.", createdAt: new Date("2026-09-13T00:00:00Z"), author: { name: "Min" } },
      { id: "second", body: "Agreed, add a mobile check.", createdAt: new Date("2026-09-14T00:00:00Z"), author: { name: "Jisoo" } },
    ],
  };
}

async function markup(session: { user: { id: string } } | null) {
  mocks.findDiscussion.mockResolvedValue(discussion());
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
    expect(mocks.findDiscussion).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ comments: { orderBy: { createdAt: "asc" }, include: expect.any(Object) } }) }));
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
  });
});
