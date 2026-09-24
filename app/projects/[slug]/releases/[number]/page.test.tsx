import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  findRelease: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, release: { findUnique: mocks.findRelease } } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));

const { default: ReleasePage } = await import("./page");
const params = (number: string) => ({ params: Promise.resolve({ slug: "demo", number }) });
const release = () => ({
  number: 3,
  title: "Navigation rethink",
  description: "A focused change.",
  createdAt: new Date("2026-09-24T00:00:00Z"),
  publishedBy: { name: "Junsu" },
  revisions: [
    { position: 0, revision: { id: "revision-12", number: 12, title: "Mobile navigation", changeDescription: "Simplify the mobile structure.", createdAt: new Date("2026-09-20T00:00:00Z"), publishedBy: { name: "Min" } } },
    { position: 1, revision: { id: "revision-13", number: 13, title: "Compact header", changeDescription: "Tighten the header.", createdAt: new Date("2026-09-21T00:00:00Z"), publishedBy: null } },
  ],
});

describe("project release detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.findProject.mockResolvedValue({ id: "project", slug: "demo", title: "Demo", ownerId: "owner", isPublic: true });
    mocks.findRelease.mockResolvedValue(release());
  });

  it("shows a public release anonymously with its publisher, description, ordered revisions, and links", async () => {
    const markup = renderToStaticMarkup(await ReleasePage(params("3")));
    expect(markup).toContain("Navigation rethink");
    expect(markup).toContain("A focused change.");
    expect(markup).toContain("Published by Junsu");
    expect(markup).toContain("Simplify the mobile structure.");
    expect(markup.indexOf("Mobile navigation")).toBeLessThan(markup.indexOf("Compact header"));
    expect(markup).toContain('href="/projects/demo/revisions/12"');
    expect(markup).toContain('href="/projects/demo/revisions/13"');
    expect(mocks.findRelease).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_number: { projectId: "project", number: 3 } },
      select: expect.objectContaining({ revisions: expect.objectContaining({ orderBy: { position: "asc" } }) }),
    }));
  });

  it("hides a private project release from non-owners", async () => {
    mocks.findProject.mockResolvedValue({ id: "project", slug: "demo", title: "Demo", ownerId: "owner", isPublic: false });
    mocks.getSession.mockResolvedValue({ user: { id: "visitor" } });
    await expect(ReleasePage(params("3"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.findRelease).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "invalid"]) ("returns not found for invalid release number %s", async (number) => {
    await expect(ReleasePage(params(number))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it("returns not found when the release number does not exist", async () => {
    mocks.findRelease.mockResolvedValue(null);
    await expect(ReleasePage(params("8"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
