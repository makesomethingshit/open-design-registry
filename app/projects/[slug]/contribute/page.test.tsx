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
  it("passes a valid related issue from the URL into the contribution workspace", async () => {
    const page = await ContributionPage({
      params: Promise.resolve({ slug: "demo" }),
      searchParams: Promise.resolve({ relatedIssue: "request-1" }),
    });

    expect(renderToStaticMarkup(page)).toContain('data-related-issue="request-1"');
  });
});
