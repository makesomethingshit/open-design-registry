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

  it("allows whole-document submission when a structured base has a URL-only source", () => {
    const markup = renderToStaticMarkup(<ProposalForm
      baseRevision={{ id: "base", number: 1, title: "Base", files: [{ id: "target", name: "Target", mimeType: "application/zip", size: 10 }] }}
      defaultRelatedIssueId=""
      defaultSourceRevisionId="source"
      relatedIssues={[]}
      slug="demo"
      sourceRevisions={[{ id: "source", number: 2, title: "URL source", projectTitle: "Contributor", projectSlug: "contributor", files: [] }]}
    />);

    expect(markup).toContain("Whole-document only.");
    expect(markup).not.toContain("Add change");
    expect(markup).not.toContain("disabled=\"\"");
  });
});
