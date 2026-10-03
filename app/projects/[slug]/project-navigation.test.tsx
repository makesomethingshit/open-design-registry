import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pathname: "/projects/demo" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ replace: vi.fn() }) }));
import ProjectNavigation, { legacyProjectDestination } from "./project-navigation";
const counts = { revisions: 2, releases: 1, discussions: 3, issues: 4, proposals: 2, contributors: 1, forks: 0 };

describe("project route navigation", () => {
  it("marks a detail route's parent tab and hides owner settings from visitors", () => {
    state.pathname = "/projects/demo/issues/issue1";
    const html = renderToStaticMarkup(<ProjectNavigation counts={counts} isOwner={false} slug="demo" />);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/projects\/demo\/issues"/);
    expect(html).not.toContain("/settings");
    expect(html).not.toContain('href="#');
  });
  it("exposes settings to the owner and marks contribution as Proposals", () => {
    state.pathname = "/projects/demo/contribute";
    const html = renderToStaticMarkup(<ProjectNavigation counts={counts} isOwner slug="demo" />);
    expect(html).toContain('href="/projects/demo/settings"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/projects\/demo\/proposals"/);
  });
  it("preserves old section/filter and contribution return URLs", () => {
    expect(legacyProjectDestination("/projects/demo", "?proposalStatus=closed", "#proposals")).toBe("/projects/demo/proposals?proposalStatus=closed#proposals");
    expect(legacyProjectDestination("/projects/demo", "?proposalStatus=closed", "")).toBe("/projects/demo/proposals?proposalStatus=closed");
    expect(legacyProjectDestination("/projects/demo", "?contributionTarget=original&baseRevision=2&relatedIssue=request", "#owner-tools")).toBe("/projects/demo/revisions?contributionTarget=original&baseRevision=2&relatedIssue=request#owner-tools");
    expect(legacyProjectDestination("/projects/demo", "?contributionTarget=original&baseRevision=2&relatedIssue=request", "")).toBe("/projects/demo/revisions?contributionTarget=original&baseRevision=2&relatedIssue=request");
    expect(legacyProjectDestination("/projects/demo", "", "#issue-closed1")).toBe("/projects/demo/issues/closed1#issue-closed1");
    expect(legacyProjectDestination("/projects/demo", "", "#project-document")).toBeNull();
  });
});
