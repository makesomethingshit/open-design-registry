import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findRevisions: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findMany: mocks.findRevisions } } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));

const { default: NewReleasePage } = await import("./page");

describe("new project release page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProject.mockResolvedValue({ id: "project", slug: "demo", title: "Demo", ownerId: "owner" });
    mocks.findRevisions.mockResolvedValue([
      { id: "revision-3", number: 3, title: "Compact header" },
      { id: "revision-4", number: 4, title: "Navigation cleanup" },
    ]);
  });

  it("shows the owner's published revision options in number order", async () => {
    const markup = renderToStaticMarkup(await NewReleasePage({ params: Promise.resolve({ slug: "demo" }) }));
    expect(mocks.findRevisions).toHaveBeenCalledWith({
      where: { projectId: "project", isPublished: true },
      orderBy: { number: "asc" },
      select: { id: true, number: true, title: true },
    });
    expect(markup.indexOf("Revision 3")).toBeLessThan(markup.indexOf("Revision 4"));
    expect(markup).toContain("Publish release");
  });

  it("shows the empty revision state and disables publishing", async () => {
    mocks.findRevisions.mockResolvedValue([]);
    const markup = renderToStaticMarkup(await NewReleasePage({ params: Promise.resolve({ slug: "demo" }) }));
    expect(markup).toContain("No published revisions available.");
    expect(markup).toContain('disabled=""');
  });

  it("redirects anonymous visitors and hides the form from non-owners", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(NewReleasePage({ params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fprojects%2Fdemo%2Freleases%2Fnew");
    expect(mocks.findProject).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    await expect(NewReleasePage({ params: Promise.resolve({ slug: "demo" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.findRevisions).not.toHaveBeenCalled();
  });
});
