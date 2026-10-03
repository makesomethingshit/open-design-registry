import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));

const { default: NotificationList } = await import("./notification-list");

describe("discussion notifications", () => {
  it.each([["ISSUE_CREATED", "issues"], ["DISCUSSION_CREATED", "discussions"], ["REVISION_PUBLISHED", "revisions"], ["RELEASE_PUBLISHED", "releases"]] as const)("opens the %s tab when the detail object is unavailable", (type, section) => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{ id: "fallback", type, readAt: null, createdAt: "2026-10-01T00:00:00.000Z", actor: { name: "Alex" }, project: { slug: "demo", title: "Demo" }, issue: null, discussion: null, forkedProject: null, proposal: null, revision: null, release: null }]} />);
    expect(html).toContain(`href="/projects/demo/${section}"`);
  });
  it.each([
    ["PROPOSAL_CREATED", "proposed changes in"],
    ["PROPOSAL_CHANGES_REQUESTED", "requested changes on"],
    ["PROPOSAL_APPROVED", "approved"],
    ["PROPOSAL_APPLIED", "applied changes from"],
  ] as const)("renders %s with a Proposal detail link", (type, action) => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "proposal-event", type, readAt: null, createdAt: "2026-10-01T00:00:00.000Z",
      actor: { name: "Alex" }, project: { slug: "demo", title: "Demo" },
      proposal: { id: "proposal", proposalNumber: 12, title: "Improve navigation" },
      issue: null, discussion: null, forkedProject: null, release: null,
      revision: type === "PROPOSAL_APPLIED" ? { id: "revision", number: 8, title: "Applied" } : null,
    }]} />);
    expect(html).toContain('href="/proposals/proposal"');
    expect(html).toContain(`Alex ${action} Proposal #12 in Demo`);
    expect(html).toContain("Improve navigation");
    expect(html).toContain('dateTime="2026-10-01T00:00:00.000Z"');
    if (type === "PROPOSAL_APPLIED") expect(html).toContain("to Revision 8");
  });

  it("links the owner notification to the new discussion", () => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "notification", type: "DISCUSSION_CREATED", readAt: null, createdAt: "2026-09-12T00:00:00.000Z",
      actor: { name: "Jisoo" }, project: { slug: "demo", title: "Demo" }, issue: null,
      discussion: { id: "discussion", title: "Mobile navigation" }, forkedProject: null, proposal: null,
      revision: null, release: null,
    }]} />);
    expect(html).toContain('href="/projects/demo/discussions/discussion"');
    expect(html).toContain("Mobile navigation");
  });
  it("links a revision notification to the published revision", () => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "watch-revision", type: "REVISION_PUBLISHED", readAt: null, createdAt: "2026-09-12T00:00:00.000Z",
      actor: { name: "Jisoo" }, project: { slug: "demo", title: "Demo" }, issue: null,
      discussion: null, forkedProject: null, proposal: null,
      revision: { id: "revision", number: 4, title: "Landing update" }, release: null,
    }]} />);
    expect(html).toContain('href="/projects/demo/revisions/4"');
    expect(html).toContain("Landing update");
  });

  it("links a release notification to the published release", () => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "watch-release", type: "RELEASE_PUBLISHED", readAt: null, createdAt: "2026-09-12T00:00:00.000Z",
      actor: { name: "Jisoo" }, project: { slug: "demo", title: "Demo" }, issue: null,
      discussion: null, forkedProject: null, proposal: null,
      revision: null, release: { id: "release", number: 2, title: "Spring cut" },
    }]} />);
    expect(html).toContain('href="/projects/demo/releases/2"');
    expect(html).toContain("Spring cut");
  });
});
