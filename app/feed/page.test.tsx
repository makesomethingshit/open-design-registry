import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getFeedPage: vi.fn(), notFound: vi.fn(() => { throw new Error("404"); }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown }) => createElement("a", { ...props, href }, children as never) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/src/lib/feed", () => ({ getFeedPage: mocks.getFeedPage, parseFeedCursor: () => null }));
const { default: FeedPage } = await import("./page");

describe("feed page", () => {
  it("shows an empty state with a route back to projects", async () => {
    mocks.getFeedPage.mockResolvedValue({ items: [], nextCursor: null });
    const markup = renderToStaticMarkup(await FeedPage({ searchParams: Promise.resolve({}) }));
    expect(markup).toContain("No public changes yet.");
    expect(markup).toContain('href="/"');
    expect(markup).not.toContain("Older changes");
  });
});
