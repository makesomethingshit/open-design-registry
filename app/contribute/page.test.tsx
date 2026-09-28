import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("next/link", () => ({ default: ({ children, ...props }: { children?: unknown } & Record<string, unknown>) => createElement("a", props as never, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { issue: { findMany: mocks.findMany } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));

const { default: ContributePage } = await import("./page");

function request(id: string) {
  return {
    id,
    title: `Request ${id}`,
    body: "Improve the mobile empty state",
    createdAt: new Date("2026-09-24T12:00:00.000Z"),
    project: {
      slug: "design-system",
      title: "Design system",
      coverUrl: "covers/design-system",
      license: "MIT",
      activityStatus: "ACTIVE",
      owner: { name: "Project owner" },
      revisions: [{ tool: "Figma", tags: ["mobile", "ui", "forms"] }],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([request("request-1")]);
});

describe("Contribution Discovery", () => {
  it("lists public open design requests with project context and stable issue links", async () => {
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));
    const query = mocks.findMany.mock.calls[0][0];

    expect(markup).toContain("Open design requests");
    expect(markup).toContain("Improve the mobile empty state");
    expect(markup).toContain("Design system");
    expect(markup).toContain("Project owner");
    expect(markup).toContain("Active");
    expect(markup).toContain("MIT");
    expect(markup).toContain("Figma");
    expect(markup).toContain("mobile");
    expect(markup).toContain('href="/projects/design-system/issues/request-1"');
    expect(markup).not.toContain("Next page");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        kind: "DESIGN_REQUEST",
        status: "OPEN",
        project: expect.objectContaining({ isPublic: true }),
      }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
    }));
    expect(query.where.project).not.toHaveProperty("activityStatus");
  });

  it("normalizes homepage filters, searches request and project text, and preserves filters in next-page links", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, index) => request(`request-${index + 1}`)));
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({ q: "  empty state ", tool: " Figma ", tag: " UI ", license: "CC BY 4.0", cursor: " request-25 " }) }));

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { title: { contains: "empty state", mode: "insensitive" } },
          { body: { contains: "empty state", mode: "insensitive" } },
          { project: { title: { contains: "empty state", mode: "insensitive" } } },
          { project: { description: { contains: "empty state", mode: "insensitive" } } },
        ],
        project: expect.objectContaining({
          isPublic: true,
          license: "CC BY 4.0",
          revisions: { some: { isPublished: true, tool: { equals: "figma" }, tags: { hasEvery: ["ui"] } } },
        }),
      }),
      cursor: { id: "request-25" },
      skip: 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
    }));
    expect(markup).toContain('href="/contribute?q=empty+state&amp;tool=figma&amp;tag=ui&amp;license=CC+BY+4.0&amp;cursor=request-24"');
  });

  it("shows an empty state and a filter reset link", async () => {
    mocks.findMany.mockResolvedValue([]);
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({ q: "nothing" }) }));

    expect(markup).toContain("No open design requests match those filters.");
    expect(markup).toMatch(/<a href="\/contribute" class="[^"]+">Clear filters<\/a>/);
    expect(markup).not.toContain("Next page");
  });

  it("shows the linked revision preview with its source", async () => {
    mocks.findMany.mockResolvedValue([{
      ...request("request-9"),
      body: "",
      revision: { number: 4, isPublished: true, previews: [{ url: "previews/revision-4", altText: "" }] },
    }]);
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("/asset/previews/revision-4");
    expect(markup).toContain("Revision 4 preview");
    expect(markup).toContain("linked to this request");
    expect(markup).not.toContain("Project cover");
    expect(markup).toContain("No summary provided");
    expect(markup).toContain('href="/projects/design-system/issues/request-9"');
    expect(markup).not.toMatch(/tabindex/);
  });

  it("labels the project cover when the request has no linked preview", async () => {
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain("/asset/covers/design-system");
    expect(markup).toContain("Project cover");
    expect(markup).toContain("request image unavailable");
    expect(markup).not.toContain("linked to this request");
    expect(markup).toContain("Figma");

    mocks.findMany.mockResolvedValue([{
      ...request("request-9"),
      revision: { number: 4, isPublished: false, previews: [{ url: "previews/revision-4", altText: "Revision 4" }] },
    }]);
    const unpublished = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));

    expect(unpublished).not.toContain("linked to this request");
    expect(unpublished).toContain("Project cover");
  });

  it("sizes the title and project links for touch", async () => {
    mocks.findMany.mockResolvedValue([request("request-1")]);
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));
    const titleAnchor = markup.match(/<h3><a[^>]*>/)?.[0] ?? "";

    expect(titleAnchor).toContain('href="/projects/design-system/issues/request-1"');
    expect(titleAnchor).toMatch(/class="[^"]+"/);
    expect(markup).toMatch(/<a class="[^"]+" href="\/projects\/design-system">Design system<\/a>/);
  });

  it("selects the first image preview and skips text/html", async () => {
    mocks.findMany.mockResolvedValue([{
      ...request("request-9"),
      revision: { number: 4, isPublished: true, previews: [{ url: "previews/revision-4.png", altText: "Revision 4", mimeType: "image/png" }] },
    }]);
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain("/asset/previews/revision-4.png");
    expect(markup).toContain("Revision 4 preview");
    expect(markup).toContain("linked to this request");
    expect(markup).not.toContain("Project cover");
  });
});
