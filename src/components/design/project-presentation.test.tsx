import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectHeader } from "./project-header";
import { RevisionItem } from "./revision-item";

describe("project presentation", () => {
  it("uses only a short source-derived introduction in the header", () => {
    const markup = renderToStaticMarkup(<ProjectHeader description="First sentence introduces the project. The full description remains in About." license="MIT" owner="Designer" revisionCount={1} slug="project" title="Project" visibility="public" />);
    expect(markup).toContain("First sentence introduces the project.");
    expect(markup).not.toContain("The full description remains in About.");
    expect(renderToStaticMarkup(<ProjectHeader description={"W".repeat(200)} license="MIT" owner="Designer" revisionCount={1} slug="project" title="Project" visibility="public" />)).toContain("…");
    expect((renderToStaticMarkup(<ProjectHeader description="" license="MIT" owner="Designer" revisionCount={1} slug="project" title="Project" visibility="public" />).match(/<p(?:\s|>)/g) ?? [])).toHaveLength(1);
  });

  it("keeps distinct times for revisions created on the same day", () => {
    const markup = renderToStaticMarkup(<ol><RevisionItem changeDescription="Morning" createdAt={new Date("2026-09-06T10:15:00Z")} href="#morning" id="morning" number={1} owner="Designer" tags={[]} title="Morning" /><RevisionItem changeDescription="Afternoon" createdAt={new Date("2026-09-06T11:45:00Z")} href="#afternoon" id="afternoon" number={2} owner="Designer" tags={[]} title="Afternoon" /></ol>);
    const times = [...markup.matchAll(/<time[^>]*>([^<]+)<\/time>/g)].map((match) => match[1]);
    expect(times).toHaveLength(2);
    expect(times[0]).not.toBe(times[1]);
    expect(times[0]).toMatch(/\d{1,2}:\d{2}/);
  });
});
