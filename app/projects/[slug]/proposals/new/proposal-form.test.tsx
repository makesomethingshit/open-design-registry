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
      sourceRevisions={[{ id: "source", number: 2, title: "URL source", projectTitle: "Contributor", projectSlug: "contributor", sourceUrl: "https://example.test/source.zip", capabilityMode: "WHOLE_DOCUMENT", files: [] }]}
    />);

    expect(markup).toContain("Whole-document only.");
    expect(markup).toContain("complete revised document for review");
    expect(markup).toContain("individual files, layers, and objects cannot be selected");
    expect(markup).not.toContain("Add change");
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("shows the source file-unit count for a structured pair", () => {
    const markup = renderToStaticMarkup(<ProposalForm
      baseRevision={{ id: "base", number: 1, title: "Base", capabilityMode: "STRUCTURED", files: [{ id: "base-file", name: "Base", mimeType: "image/svg+xml", size: 10 }] }}
      defaultRelatedIssueId=""
      defaultSourceRevisionId="source"
      relatedIssues={[]}
      slug="demo"
      sourceRevisions={[{ id: "source", number: 2, title: "Structured source", projectTitle: "Contributor", projectSlug: "contributor", capabilityMode: "STRUCTURED", files: [{ id: "source-a", name: "A", mimeType: "image/svg+xml", size: 10 }, { id: "source-b", name: "B", mimeType: "image/svg+xml", size: 12 }] }]}
    />);

    expect(markup).toContain("2 selectable published file units");
    expect(markup).toContain("layers and objects are not selectable");
  });

  it("labels missing legacy capability data as unknown without blocking whole-document preparation", () => {
    const markup = renderToStaticMarkup(<ProposalForm
      baseRevision={{ id: "base", number: 1, title: "Legacy base", files: [] }}
      defaultRelatedIssueId=""
      defaultSourceRevisionId="source"
      relatedIssues={[]}
      slug="demo"
      sourceRevisions={[{ id: "source", number: 2, title: "Legacy source", projectTitle: "Contributor", projectSlug: "contributor", files: [] }]}
    />);

    expect(markup).toContain("Capability not recorded.");
    expect(markup).toContain("Whole-document proposals remain available");
    expect(markup).not.toContain("disabled=\"\"");
  });
});
