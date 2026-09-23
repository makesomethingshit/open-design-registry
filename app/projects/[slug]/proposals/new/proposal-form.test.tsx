import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

const { default: ProposalForm } = await import("./proposal-form");

describe("proposal related issue labels", () => {
  it("includes both issue kinds with a visible type label", () => {
    const markup = renderToStaticMarkup(<ProposalForm
      baseRevision={{ id: "base", number: 1, title: "Base", files: [] }}
      defaultRelatedIssueId=""
      defaultSourceRevisionId="source"
      relatedIssues={[
        { id: "issue", title: "Fix navigation", kind: "ISSUE" },
        { id: "request", title: "Create mobile empty state", kind: "DESIGN_REQUEST" },
      ]}
      slug="demo"
      sourceRevisions={[{ id: "source", number: 1, title: "Source", projectTitle: "Contributor", projectSlug: "contributor", files: [] }]}
    />);

    expect(markup).toContain("Issue · Fix navigation");
    expect(markup).toContain("Design request · Create mobile empty state");
  });
});
