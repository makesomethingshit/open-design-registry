import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ findProposal: vi.fn(), findLatest: vi.fn(), getSession: vi.fn(), readBundle: vi.fn(), review: vi.fn(() => null) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { revision: { findFirst: mocks.findLatest } } }));
vi.mock("@/src/lib/proposal-handlers", () => ({ findVisibleProposal: mocks.findProposal }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ readRevisionBundle: mocks.readBundle }));
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
});
