import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
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
});
