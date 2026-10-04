import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/app/projects/[slug]/project-shell", () => ({ default: ({ children }: { children: unknown }) => children }));

const mocks = vi.hoisted(() => ({ findProposal: vi.fn(), findLatest: vi.fn(), getSession: vi.fn(), readBundle: vi.fn(), review: vi.fn(() => null), proposalStatus: vi.fn(() => ({ label: "Status", tone: "neutral" as const, icon: "clock" as const })) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { revision: { findFirst: mocks.findLatest } } }));
vi.mock("@/src/lib/proposal-handlers", () => ({ findVisibleProposal: mocks.findProposal }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle, sameDependencySet: (left: string[] = [], right: string[] = []) => left.length === right.length && left.every((id) => right.includes(id)) }));
vi.mock("@/src/lib/ui/status-presentation", () => ({ proposalStatusPresentation: mocks.proposalStatus }));
vi.mock("./proposal-review", () => ({ default: mocks.review }));

const { default: ProposalPage } = await import("./page");

describe("proposal review data", () => {
  it("passes the latest rename name and unit-local preview positions to review", async () => {
    const now = new Date();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProposal.mockResolvedValue({
      id: "proposal", project: { id: "project", slug: "project", title: "Project", ownerId: "owner" }, baseRevisionId: "base", authorId: "author", relatedIssue: null, appliedRevisions: [],
      baseRevision: { id: "base", number: 1, title: "Base", sourceKey: "base-bundle", previews: [{ id: "base-preview", position: 4, key: "base-card", url: "base-card", mimeType: "image/png", altText: "Base card" }] },
      sourceRevision: { id: "source", number: 2, title: "Source", sourceKey: null, project: { slug: "source", title: "Source", isPublic: true }, previews: [] },
      changeSet: { changes: [{ id: "rename", type: "RENAME_UNIT", action: "RENAME_UNIT", target: "Card", targetFileId: "card", name: "Base card", newName: "Proposed card", kind: "component", mimeType: null, size: null, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, reviewHistory: [{ id: "history", status: "APPROVED", comment: null, createdAt: now, author: { name: "Owner" } }] }] },
      comments: [], proposalNumber: 1, title: "Rename card", body: "Rename it", status: "APPROVED", author: { name: "Author" }, sourceRevisionId: "source",
    });
    mocks.findLatest.mockResolvedValue({ id: "latest", number: 3, title: "Latest", sourceKey: "latest-bundle", previews: [{ id: "removed-preview", position: 0, key: "removed", url: "removed", mimeType: "image/png", altText: "Removed" }, { id: "latest-preview", position: 1, key: "latest-card", url: "latest-card", mimeType: "image/png", altText: "Latest card" }] });
    mocks.readBundle.mockImplementation((key: string | null | undefined) => Promise.resolve(key === "base-bundle" ? { version: 2, files: [{ id: "card", name: "Base card", kind: "component", mimeType: "image/png", size: 1, assetKey: "base-card", previewKeys: ["base-card"] }] } : key === "latest-bundle" ? { version: 2, files: [{ id: "removed", name: "Removed", kind: "asset", mimeType: "image/png", size: 1, assetKey: "removed", previewKeys: ["removed"] }, { id: "card", name: "Latest card", kind: "component", mimeType: "image/png", size: 1, assetKey: "latest-card", previewKeys: ["latest-card"] }] } : null));

    const page = await ProposalPage({ params: Promise.resolve({ id: "proposal" }) });
    renderToStaticMarkup(page);
    const reviewProps = (mocks.review.mock.calls as unknown as Array<[{ changes: Array<{ latestName: string | null; basePreviews: Array<{ position: number }>; latestPreviews: Array<{ position: number }> }> }]>).at(0)?.[0];
    expect(reviewProps?.changes[0]).toMatchObject({ latestName: "Latest card", basePreviews: [{ position: 0 }], latestPreviews: [{ position: 0 }] });
  });

  it("uses applied change count rather than applied revision count for partial application", async () => {
    const appliedRevision = { id: "revision-3", number: 3, title: "Applied" };
    const change = (id: string, applied: boolean) => ({ id, type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: id, targetFileId: id, name: id, newName: null, kind: "component", mimeType: "image/png", size: 1, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: applied ? appliedRevision : null, reviewHistory: [] });
    mocks.proposalStatus.mockClear();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProposal.mockResolvedValue({
      id: "proposal", project: { id: "project", slug: "project", title: "Project", ownerId: "owner" }, baseRevisionId: "base", authorId: "author", relatedIssue: null, appliedRevisions: [appliedRevision],
      baseRevision: { id: "base", number: 1, title: "Base", sourceKey: null, previews: [] },
      sourceRevision: { id: "source", number: 2, title: "Source", sourceKey: null, project: { slug: "source", title: "Source", isPublic: true }, previews: [] },
      changeSet: { changes: [change("one", true), change("two", true), change("three", false), change("four", false)] },
      comments: [], proposalNumber: 1, title: "Partial proposal", body: "Apply two changes", status: "PARTIALLY_ACCEPTED", author: { name: "Author" }, sourceRevisionId: "source",
    });
    mocks.findLatest.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const page = await ProposalPage({ params: Promise.resolve({ id: "proposal" }) });
    renderToStaticMarkup(page);

    expect(mocks.proposalStatus).toHaveBeenLastCalledWith("PARTIALLY_ACCEPTED", 2, 4);
  });

  it("normalizes a legacy accepted document replacement before presenting it", async () => {
    const appliedRevision = { id: "revision-3", number: 3, title: "Applied" };
    mocks.proposalStatus.mockClear();
    mocks.review.mockClear();
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProposal.mockResolvedValue({
      id: "proposal", project: { id: "project", slug: "project", title: "Project", ownerId: "owner" }, baseRevisionId: "base", authorId: "author", relatedIssue: null, appliedRevisions: [appliedRevision],
      baseRevision: { id: "base", number: 1, title: "Base", sourceKey: null, previews: [] },
      sourceRevision: { id: "source", number: 2, title: "Source", sourceKey: null, project: { slug: "source", title: "Source", isPublic: true }, previews: [] },
      changeSet: { changes: [{ id: "document", type: "REPLACE_DOCUMENT", action: null, target: "whole_document", targetFileId: null, name: null, newName: null, kind: null, mimeType: null, size: null, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, reviewHistory: [] }] },
      comments: [], proposalNumber: 1, title: "Legacy proposal", body: "Replace the document", status: "ACCEPTED", author: { name: "Author" }, sourceRevisionId: "source",
    });
    mocks.findLatest.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const page = await ProposalPage({ params: Promise.resolve({ id: "proposal" }) });
    renderToStaticMarkup(page);
    const reviewProps = (mocks.review.mock.calls as unknown as Array<[{ changes: Array<{ appliedRevision: { id: string } | null }> }]>).at(0)?.[0];

    expect(reviewProps?.changes[0].appliedRevision).toMatchObject({ id: "revision-3" });
    expect(mocks.proposalStatus).toHaveBeenLastCalledWith("ACCEPTED", 1, 1);
  });

  it("links a related issue to its concrete issue-board anchor", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProposal.mockResolvedValue({
      id: "proposal", project: { id: "project", slug: "project", title: "Project", ownerId: "owner" }, baseRevisionId: "base", authorId: "author", relatedIssue: { id: "issue-14", title: "Fix navigation" }, appliedRevisions: [],
      baseRevision: { id: "base", number: 1, title: "Base", sourceKey: null, previews: [] },
      sourceRevision: { id: "source", number: 2, title: "Source", sourceKey: null, project: { slug: "source", title: "Source", isPublic: true }, previews: [] },
      changeSet: { changes: [] }, comments: [], proposalNumber: 32, title: "Navigation proposal", body: "Connect it", status: "OPEN", author: { name: "Author" }, sourceRevisionId: "source",
    });
    mocks.findLatest.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ProposalPage({ params: Promise.resolve({ id: "proposal" }) }));

    expect(markup).toContain('href="/projects/project/issues/issue-14"');
    expect(markup).toContain("Fix navigation");
  });
});

describe("proposal origin", () => {
  const baseProposal = (relatedIssue: unknown) => ({
    id: "proposal", project: { id: "project", slug: "project", title: "Project", ownerId: "owner" }, baseRevisionId: "base", authorId: "author", relatedIssue, appliedRevisions: [],
    baseRevision: { id: "base", number: 1, title: "Base", sourceKey: null, previews: [] },
    sourceRevision: { id: "source", number: 2, title: "Source", sourceKey: null, project: { slug: "source", title: "Source", isPublic: true }, previews: [] },
    changeSet: { changes: [] }, comments: [], proposalNumber: 32, title: "Navigation proposal", body: "Connect it", status: "OPEN", author: { name: "Author" }, sourceRevisionId: "source",
  });

  async function renderOrigin(relatedIssue: unknown) {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    mocks.findProposal.mockResolvedValue(baseProposal(relatedIssue));
    mocks.findLatest.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);
    return renderToStaticMarkup(await ProposalPage({ params: Promise.resolve({ id: "proposal" }) }));
  }

  it("shows the discussion and issue chain for a discussion-sourced issue", async () => {
    const markup = await renderOrigin({ id: "issue-14", title: "Fix mobile navigation", kind: "ISSUE", sourceDiscussion: { id: "discussion-7", title: "Mobile navigation" } });

    expect(markup).toContain("Mobile navigation");
    expect(markup).toContain('href="/projects/project/discussions/discussion-7"');
    expect(markup).toContain("Fix mobile navigation");
    expect(markup).toContain('href="/projects/project/issues/issue-14"');
  });

  it("labels a design request work item", async () => {
    const markup = await renderOrigin({ id: "issue-15", title: "Explore compact header", kind: "DESIGN_REQUEST", sourceDiscussion: { id: "discussion-7", title: "Mobile navigation" } });

    expect(markup).toContain("Design request");
    expect(markup).toContain('href="/projects/project/issues/issue-15"');
  });

  it("shows a legacy issue without inventing a discussion link", async () => {
    const markup = await renderOrigin({ id: "issue-16", title: "Legacy issue", kind: "ISSUE", sourceDiscussion: null });

    expect(markup).toContain("Legacy issue");
    expect(markup).not.toContain("/discussions/");
  });

  it("shows no origin section without a related issue", async () => {
    const markup = await renderOrigin(null);

    expect(markup).not.toContain("Origin");
  });
});
