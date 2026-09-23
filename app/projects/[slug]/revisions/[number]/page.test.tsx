import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  findRevision: vi.fn(),
  getSession: vi.fn(),
  readBundle: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, revision: { findUnique: mocks.findRevision } } }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle }));
vi.mock("@/app/capability-badge", () => ({ default: () => null }));
vi.mock("../../revision-diff", () => ({ default: () => null }));
vi.mock("../../../../reports/report-form", () => ({ default: () => null }));
vi.mock("./fork-form", () => ({ default: () => null }));
vi.mock("./restore-form", () => ({ default: () => null }));

const { default: RevisionPage } = await import("./page");

const project = {
  id: "project",
  slug: "demo",
  title: "Demo project",
  ownerId: "owner",
  isPublic: true,
  license: "MIT",
  owner: { name: "Project owner" },
};

function change(id: string, name: string, appliedRevisionId: string | null, action = "ADD_UNIT") {
  return { id, appliedRevisionId, type: action, action, target: name, name, newName: null, kind: "component" };
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: "r14",
    projectId: "project",
    number: 14,
    parentId: "r13",
    sourceProposalId: "proposal-32",
    title: "Revision 14",
    changeDescription: "Applied proposal",
    license: "MIT",
    sourceKey: null,
    sourceUrl: null,
    tool: null,
    toolVersion: null,
    tags: [],
    sourceChecksum: null,
    capabilityMode: null,
    capabilityUnitCount: null,
    adapterId: null,
    adapterVersion: null,
    adapterConfidence: null,
    adapterMaturity: null,
    publishedById: "publisher",
    publishedBy: { id: "publisher", name: "Actual publisher" },
    isPublished: true,
    createdAt: new Date("2026-09-10T00:00:00Z"),
    previews: [],
    parent: { id: "r13", number: 13, previews: [] },
    appliedProposal: {
      id: "proposal-32",
      proposalNumber: 32,
      title: "Proposal 32",
      project: { id: "project", ownerId: "owner", isPublic: true },
      baseRevision: { projectId: "project", isPublished: true },
      sourceRevision: { isPublished: true, project: { ownerId: "source-owner", isPublic: true } },
      author: { id: "contributor", name: "Contributor" },
    },
    appliedChanges: [
      { ...change("change-a", "A", "r14"), reviewedBy: { id: "reviewer", name: "Reviewer" } },
      { ...change("change-b", "B", "r14", "MODIFY_UNIT"), reviewedBy: { id: "reviewer", name: "Reviewer" } },
      { ...change("change-c", "C", "r13"), reviewedBy: { id: "other-reviewer", name: "Other reviewer" } },
    ],
    ...overrides,
  };
}

async function renderRevision(session: unknown, overrides: Record<string, unknown> = {}) {
  mocks.findProject.mockResolvedValue(project);
  mocks.findRevision.mockResolvedValue(revision(overrides));
  mocks.getSession.mockResolvedValue(session);
  mocks.readBundle.mockResolvedValue(null);
  return renderToStaticMarkup(await RevisionPage({ params: Promise.resolve({ slug: "demo", number: "14" }) }));
}

describe("Revision provenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attributes publication to the revision publisher instead of the project owner", async () => {
    const markup = await renderRevision(null);

    expect(markup).toContain("Published by Actual publisher");
    expect(markup).not.toContain("Published by Project owner");
  });

  it("renders a legacy revision without inventing a publisher", async () => {
    const markup = await renderRevision(null, { publishedById: null, publishedBy: null });

    expect(markup).toContain("Publisher not recorded");
    expect(markup).not.toContain("Published by Project owner");
  });

  it("deduplicates final reviewers applied to this revision", async () => {
    const markup = await renderRevision(null);

    expect(markup.match(/Reviewed by/g)).toHaveLength(1);
    expect(markup).toContain("<dd>Reviewer</dd>");
    expect(markup).not.toContain("Other reviewer");
  });

  it("shows the parent and only changes applied to the current revision", async () => {
    const markup = await renderRevision(null);

    expect(markup).toContain('href="/projects/demo/revisions/13"');
    expect(markup).toContain("Revision 13");
    expect(markup).toContain('href="/proposals/proposal-32"');
    expect(markup).toContain("Proposal #32");
    expect(markup).toContain("Add A");
    expect(markup).toContain("Modify B");
    expect(markup).not.toContain("Add C");
  });

  it("renders a manual or legacy revision without an empty provenance section", async () => {
    const markup = await renderRevision(null, { parent: null, sourceProposalId: null, appliedProposal: null, appliedChanges: [] });

    expect(markup).not.toContain("Provenance");
    expect(markup).not.toContain("No proposal");
  });

  it("shows revision tags in the detail metadata", async () => {
    const markup = await renderRevision(null, { tags: ["ui", "mobile"] });

    expect(markup).toContain('aria-label="Revision tags"');
    expect(markup).toContain(">ui</span>");
    expect(markup).toContain(">mobile</span>");
  });

  it("hides private source proposal metadata and change names from a non-owner", async () => {
    const markup = await renderRevision({ user: { id: "viewer" } }, {
      appliedProposal: {
        ...revision().appliedProposal,
        title: "Private Proposal",
        sourceRevision: { isPublished: true, project: { ownerId: "source-owner", isPublic: false } },
      },
      appliedChanges: [{ ...change("secret", "Secret change", "r14"), reviewedBy: { id: "secret-reviewer", name: "Secret reviewer" } }],
    });

    expect(markup).not.toContain("Private Proposal");
    expect(markup).not.toContain("Proposal #32");
    expect(markup).not.toContain("Secret change");
    expect(markup).not.toContain("Contributor</dd>");
    expect(markup).not.toContain("Secret reviewer");
    expect(markup).not.toContain("Reviewed by");
    expect(markup).toContain("Contribution provenance is not available to this viewer.");
  });

  it("hides private source proposal metadata from an anonymous reader", async () => {
    const markup = await renderRevision(null, {
      appliedProposal: {
        ...revision().appliedProposal,
        title: "Private Proposal",
        sourceRevision: { isPublished: true, project: { ownerId: "source-owner", isPublic: false } },
      },
      appliedChanges: [change("secret", "Secret change", "r14")],
    });

    expect(markup).not.toContain("Private Proposal");
    expect(markup).not.toContain("Secret change");
  });

  it("shows private source provenance to its source owner", async () => {
    const markup = await renderRevision({ user: { id: "source-owner" } }, {
      appliedProposal: {
        ...revision().appliedProposal,
        title: "Private Proposal",
        sourceRevision: { isPublished: true, project: { ownerId: "source-owner", isPublic: false } },
      },
      appliedChanges: [change("secret", "Secret change", "r14")],
    });

    expect(markup).toContain("Private Proposal");
    expect(markup).toContain("Proposal #32");
    expect(markup).toContain("Add Secret change");
  });

  it("hides unpublished source provenance even from its owner", async () => {
    const markup = await renderRevision({ user: { id: "source-owner" } }, {
      appliedProposal: {
        ...revision().appliedProposal,
        title: "Unpublished Proposal",
        sourceRevision: { isPublished: false, project: { ownerId: "source-owner", isPublic: false } },
      },
      appliedChanges: [change("secret", "Unpublished change", "r14")],
    });

    expect(markup).not.toContain("Unpublished Proposal");
    expect(markup).not.toContain("Unpublished change");
  });
});

describe("Revision upstream work chain", () => {
  beforeEach(() => vi.clearAllMocks());

  function chainProposal(overrides: Record<string, unknown> = {}) {
    return {
      ...revision().appliedProposal,
      relatedIssue: { id: "issue-14", title: "Fix mobile navigation", kind: "ISSUE", sourceDiscussion: { id: "discussion-7", title: "Mobile navigation" } },
      ...overrides,
    };
  }

  it("links the discussion, work item, and proposal chain", async () => {
    const markup = await renderRevision(null, { appliedProposal: chainProposal() });

    expect(markup).toContain("Mobile navigation");
    expect(markup).toContain('href="/projects/demo/discussions/discussion-7"');
    expect(markup).toContain("Fix mobile navigation");
    expect(markup).toContain('href="/projects/demo#issue-issue-14"');
    expect(markup).toContain('href="/proposals/proposal-32"');
    expect(markup).toContain("Proposal #32");
  });

  it("labels a design request work item", async () => {
    const markup = await renderRevision(null, { appliedProposal: chainProposal({ relatedIssue: { id: "issue-15", title: "Explore compact header", kind: "DESIGN_REQUEST", sourceDiscussion: { id: "discussion-7", title: "Mobile navigation" } } }) });

    expect(markup).toContain("Design request");
    expect(markup).toContain("Explore compact header");
  });

  it("shows a work item without inventing a discussion link", async () => {
    const markup = await renderRevision(null, { appliedProposal: chainProposal({ relatedIssue: { id: "issue-16", title: "Legacy issue", kind: "ISSUE", sourceDiscussion: null } }) });

    expect(markup).toContain("Legacy issue");
    expect(markup).not.toContain("Origin discussion");
  });

  it("hides the whole work chain when proposal provenance is hidden", async () => {
    const markup = await renderRevision({ user: { id: "viewer" } }, {
      appliedProposal: {
        ...chainProposal({ title: "Private Proposal" }),
        sourceRevision: { isPublished: true, project: { ownerId: "source-owner", isPublic: false } },
      },
      appliedChanges: [{ ...change("secret", "Secret change", "r14"), reviewedBy: { id: "secret-reviewer", name: "Secret reviewer" } }],
    });

    expect(markup).not.toContain("Private Proposal");
    expect(markup).not.toContain("Fix mobile navigation");
    expect(markup).not.toContain("Mobile navigation");
  });
});
