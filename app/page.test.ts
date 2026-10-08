import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import HomePage from "./page";

it("introduces the product and links to public Explore", () => {
  const markup = renderToStaticMarkup(HomePage());
  expect(markup).toContain('Good design.<br/><span>Built in the open.</span>');
  expect(markup).toContain('href="/explore"');
  expect(markup).not.toContain('id="projects"');
  expect(markup).not.toMatch(/Penpot|Figma|\.penpot/);
  expect(markup).toContain('aster-identity.zip');
  expect(markup).toContain('packaging.svg');
  expect(markup).toContain('Source links');
  const hero = markup.split('</section>')[0];
  expect(hero).not.toContain('href="/projects/new"');
  expect(markup.indexOf('Create a project')).toBeGreaterThan(markup.indexOf('</figure>'));
});
