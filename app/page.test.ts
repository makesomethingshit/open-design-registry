import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import HomePage from "./page";

it("introduces the product and links to public Explore", () => {
  const markup = renderToStaticMarkup(HomePage());
  expect(markup).toContain('Good design.<br/><span>Built in the open.</span>');
  expect(markup).toContain('href="/explore"');
  expect(markup).not.toContain('id="projects"');
});
