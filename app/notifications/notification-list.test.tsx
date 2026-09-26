import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown; [key: string]: unknown }) => createElement("a", { href, ...props }, children as never) }));

const { default: NotificationList } = await import("./notification-list");

describe("discussion notifications", () => {
  it("links the owner notification to the new discussion", () => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "notification", type: "DISCUSSION_CREATED", readAt: null, createdAt: "2026-09-12T00:00:00.000Z",
      actor: { name: "Jisoo" }, project: { slug: "demo", title: "Demo" }, issue: null,
      discussion: { id: "discussion", title: "Mobile navigation" }, forkedProject: null,
      revision: null, release: null,
    }]} />);
    expect(html).toContain('href="/projects/demo/discussions/discussion"');
    expect(html).toContain("Mobile navigation");
  });
  it("links a revision notification to the published revision", () => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "watch-revision", type: "REVISION_PUBLISHED", readAt: null, createdAt: "2026-09-12T00:00:00.000Z",
      actor: { name: "Jisoo" }, project: { slug: "demo", title: "Demo" }, issue: null,
      discussion: null, forkedProject: null,
      revision: { id: "revision", number: 4, title: "Landing update" }, release: null,
    }]} />);
    expect(html).toContain('href="/projects/demo/revisions/4"');
    expect(html).toContain("Landing update");
  });

  it("links a release notification to the published release", () => {
    const html = renderToStaticMarkup(<NotificationList unreadCount={1} notifications={[{
      id: "watch-release", type: "RELEASE_PUBLISHED", readAt: null, createdAt: "2026-09-12T00:00:00.000Z",
      actor: { name: "Jisoo" }, project: { slug: "demo", title: "Demo" }, issue: null,
      discussion: null, forkedProject: null,
      revision: null, release: { id: "release", number: 2, title: "Spring cut" },
    }]} />);
    expect(html).toContain('href="/projects/demo/releases/2"');
    expect(html).toContain("Spring cut");
  });
});
