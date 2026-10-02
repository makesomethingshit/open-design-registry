import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/explore", useSearchParams: () => new URLSearchParams("q=+design+kit+") }));
const { default: GlobalSearch } = await import("./global-search");

it("submits to public Explore with the current URL query in the input", () => {
  const markup = renderToStaticMarkup(GlobalSearch());
  expect(markup).toContain('action="/explore"');
  expect(markup).toContain('value="design kit"');
});
