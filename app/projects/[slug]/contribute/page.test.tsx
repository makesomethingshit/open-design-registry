import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), findProject: vi.fn(), findProjects: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject, findMany: mocks.findProjects } } }));
vi.mock("./contribution-workspace", () => ({ default: (props: { initialRelatedIssueId?: string }) => createElement("div", { "data-related-issue": props.initialRelatedIssueId }) }));

const { default: ContributionPage } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "contributor" } });
  mocks.findProject.mockResolvedValue({
    id: "project-id",
    ownerId: "owner",
    isPublic: true,
    slug: "demo",
    title: "Demo project",
    owner: { name: "Owner" },
    revisions: [{ id: "revision-1", number: 1, title: "Initial" }],
    issues: [{ id: "request-1", title: "Improve mobile empty state", kind: "DESIGN_REQUEST" }],
  });
  mocks.findProjects.mockResolvedValue([]);
});

describe("contribution page request context", () => {
  it("preserves a related issue through the login redirect", async () => {
    mocks.getSession.mockResolvedValue(null);

    await expect(ContributionPage({
      params: Promise.resolve({ slug: "demo" }),
      searchParams: Promise.resolve({ relatedIssue: "request-1" }),
    })).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fprojects%2Fdemo%2Fcontribute%3FrelatedIssue%3Drequest-1");
  });

  it("passes a valid related issue from the URL into the contribution workspace", async () => {
    const page = await ContributionPage({
      params: Promise.resolve({ slug: "demo" }),
      searchParams: Promise.resolve({ relatedIssue: "request-1" }),
    });

    expect(renderToStaticMarkup(page)).toContain('data-related-issue="request-1"');
  });

  it("preserves the selected base, source, and request through sign-in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const context = { baseRevision: "1", sourceProject: "my-work", sourceRevision: "2", relatedIssue: "request-1" };
    const next = `/projects/demo/contribute?${new URLSearchParams(context)}`;
    await expect(ContributionPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve(context) }))
      .rejects.toThrow(`NEXT_REDIRECT:/login?next=${encodeURIComponent(next)}`);
  });
});
