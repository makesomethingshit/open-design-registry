import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject } } }));

const { default: NewDiscussionPage } = await import("./page");

describe("new discussion page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue({ title: "Demo", isPublic: true });
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
  });

  it("shows only the requested Title and Body fields to signed-in users", async () => {
    const html = renderToStaticMarkup(await NewDiscussionPage({ params: Promise.resolve({ slug: "demo" }) }));
    expect(html).toContain("Start a discussion");
    expect(html).toContain('name="title"');
    expect(html).toContain('name="body"');
    expect(html).not.toContain('name="category"');
    expect(html).toContain("Everyone who can view this project can read the discussion.");
  });

  it("provides a Cancel link back to the Project section", async () => {
    const html = renderToStaticMarkup(await NewDiscussionPage({ params: Promise.resolve({ slug: "demo" }) }));
    expect(html).toContain('href="/projects/demo#discussions"');
    expect(html).toContain("Cancel");
  });

  it("redirects anonymous visitors through the login flow", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(NewDiscussionPage({ params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("/login?next=%2Fprojects%2Fdemo%2Fdiscussions%2Fnew");
  });

  it("returns 404 for private projects", async () => {
    mocks.findProject.mockResolvedValue({ title: "Private", isPublic: false });
    await expect(NewDiscussionPage({ params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getSession).not.toHaveBeenCalled();
  });
});
