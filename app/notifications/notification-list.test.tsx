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
    }]} />);
    expect(html).toContain('href="/projects/demo/discussions/discussion"');
    expect(html).toContain("Mobile navigation");
  });
});
