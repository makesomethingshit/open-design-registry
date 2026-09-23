import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { default: IssueBoard } = await import("./issue-board");

describe("IssueBoard provenance links", () => {
  it("shows kind badges and only gives the owner a kind selector", () => {
    const ownerMarkup = renderToStaticMarkup(<IssueBoard
      canManage
      issues={[
        { id: "issue", title: "Header overlap", body: "Fix it", kind: "ISSUE", status: "OPEN", revision: null, author: { name: "Reporter" }, comments: [] },
        { id: "request", title: "Mobile empty state", body: "Create it", kind: "DESIGN_REQUEST", status: "OPEN", revision: null, author: { name: "Owner" }, comments: [] },
      ]}
      revisions={[]}
      signedIn
      slug="demo"
    />);
    const requestCard = ownerMarkup.match(/<article class="issue" id="issue-request"[\s\S]*?<\/article>/)?.[0] ?? "";
    expect(requestCard).toMatch(/<span class="[^"]+" data-tone="neutral">Design request<\/span>/);
    expect(ownerMarkup).toContain('name="kind"');

    const nonOwnerMarkup = renderToStaticMarkup(<IssueBoard
      canManage={false}
      issues={[]}
      revisions={[]}
      signedIn
      slug="demo"
    />);
    expect(nonOwnerMarkup).not.toContain('name="kind"');
  });

  it("links a related proposal to its applied revisions and keeps the issue anchor stable", () => {
    const markup = renderToStaticMarkup(<IssueBoard
      canManage={false}
      issues={[{
        id: "issue-14",
        title: "Fix navigation",
        body: "Improve the header",
        status: "OPEN",
        revision: { number: 13 },
        author: { name: "Reporter" },
        comments: [],
        proposals: [{
          id: "proposal-32",
          proposalNumber: 32,
          title: "Proposal 32",
          status: "PARTIALLY_ACCEPTED",
          appliedRevisions: [{ id: "r14", number: 14, title: "Revision 14" }],
        }],
      }]}
      revisions={[{ id: "r14", number: 14, title: "Revision 14" }]}
      signedIn={false}
      slug="demo"
    />);

    expect(markup).toContain('id="issue-issue-14"');
    expect(markup).toContain('href="/proposals/proposal-32"');
    expect(markup).toContain('href="/projects/demo/revisions/14"');
    expect(markup).toContain("Proposal 32");
    expect(markup).toContain("Revision 14");
  });

  it("renders only the visible proposal data supplied by the server", () => {
    const markup = renderToStaticMarkup(<IssueBoard
      canManage={false}
      issues={[{
        id: "issue-14",
        title: "Fix navigation",
        body: "Improve the header",
        status: "OPEN",
        revision: null,
        author: { name: "Reporter" },
        comments: [],
        proposals: [{ id: "public-proposal", proposalNumber: 32, title: "Public proposal", status: "OPEN", appliedRevisions: [] }],
      }]}
      revisions={[]}
      signedIn={false}
      slug="demo"
    />);

    expect(markup).toContain("Public proposal");
    expect(markup).not.toContain("Private proposal");
    expect(markup).not.toContain("Secret change");
  });

  it("links both issues and design requests back to their source Discussion", () => {
    const markup = renderToStaticMarkup(<IssueBoard
      canManage={false}
      issues={[
        { id: "issue", title: "Fix navigation", body: "Details", kind: "ISSUE", status: "OPEN", revision: null, sourceDiscussion: { id: "discussion-1", title: "Mobile navigation" }, author: { name: "Reporter" }, comments: [] },
        { id: "request", title: "Compact header", body: "Details", kind: "DESIGN_REQUEST", status: "OPEN", revision: null, sourceDiscussion: { id: "discussion-1", title: "Mobile navigation" }, author: { name: "Owner" }, comments: [] },
      ]}
      revisions={[]}
      signedIn={false}
      slug="demo"
    />);

    expect(markup.match(/From discussion: Mobile navigation/g)).toHaveLength(2);
    expect(markup.match(/href="\/projects\/demo\/discussions\/discussion-1"/g)).toHaveLength(2);
  });

  it("keeps the existing card metadata when no source Discussion exists", () => {
    const markup = renderToStaticMarkup(<IssueBoard
      canManage={false}
      issues={[{ id: "legacy", title: "Old issue", body: "Details", kind: "ISSUE", status: "OPEN", revision: null, sourceDiscussion: null, author: { name: "Reporter" }, comments: [] }]}
      revisions={[]}
      signedIn={false}
      slug="demo"
    />);

    expect(markup).toContain("Opened by Reporter");
    expect(markup).not.toContain("From discussion");
  });
});
