import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectCard } from "./project-card";

describe("ProjectCard", () => {
  const project = { coverUrl: "/api/assets?key=cover", description: "A reusable kit", href: "/projects/kit", license: "MIT", owner: "Designer", tags: ["ui"], title: "Design kit", updatedAt: new Date("2026-09-06T00:00:00.000Z") };

  it("reserves a 4:3 image card and defers non-priority project images", () => {
    const markup = renderToStaticMarkup(<ProjectCard {...project} />);
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain("Design kit cover");
    expect(markup).toContain("A reusable kit");
  });

  it("loads first-viewport project images eagerly", () => {
    const markup = renderToStaticMarkup(<ProjectCard {...project} priority />);
    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('fetchPriority="high"');
  });
});
