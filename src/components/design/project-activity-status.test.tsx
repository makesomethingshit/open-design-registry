import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectCard } from "./project-card";
import { ProjectHeader } from "./project-header";

const card = { coverUrl: "/api/assets?key=cover", description: "A reusable kit", href: "/projects/kit", license: "MIT", owner: "Designer", tags: ["ui"], title: "Design kit", updatedAt: new Date("2026-09-06T00:00:00.000Z") };
const header = { description: "A project.", license: "MIT", owner: "Designer", revisionCount: 1, slug: "project", title: "Project" } as const;

describe("project activity status display", () => {
  it("defaults to Active and labels paused/archived states", () => {
    expect(renderToStaticMarkup(<ProjectCard {...card} />)).toContain("Active");
    expect(renderToStaticMarkup(<ProjectCard {...card} activityStatus="PAUSED" />)).toContain("Paused");
    expect(renderToStaticMarkup(<ProjectCard {...card} activityStatus="ARCHIVED" />)).toContain("Archived");
    expect(renderToStaticMarkup(<ProjectHeader {...header} visibility="public" />)).toContain("Active");
    expect(renderToStaticMarkup(<ProjectHeader {...header} activityStatus="PAUSED" visibility="public" />)).toContain("Paused");
    expect(renderToStaticMarkup(<ProjectHeader {...header} activityStatus="ARCHIVED" visibility="private" />)).toContain("Archived");
  });

  it("never renders completion-style states", () => {
    for (const markup of [
      renderToStaticMarkup(<ProjectCard {...card} activityStatus="PAUSED" />),
      renderToStaticMarkup(<ProjectHeader {...header} activityStatus="ARCHIVED" visibility="public" />),
    ]) {
      expect(markup).not.toMatch(/Completed|Final|Stable/);
    }
  });
});
