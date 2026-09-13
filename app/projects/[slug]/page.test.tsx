import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  getSession: vi.fn(),
  listProposals: vi.fn(),
  countProposals: vi.fn(),
  contributors: vi.fn(),
  findProposal: vi.fn(),
  readBundle: vi.fn(),
  issueBoard: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject } } }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ publicBundleFiles: () => [], readRevisionBundle: mocks.readBundle }));
vi.mock("@/src/lib/proposal-handlers", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/proposal-handlers")>("@/src/lib/proposal-handlers");
  return { ...actual, countVisibleProposals: mocks.countProposals, findVisibleProposal: mocks.findProposal, listVisibleProposalSummaries: mocks.listProposals, visibleProposalContributorIds: mocks.contributors };
});
vi.mock("@/src/lib/ui/status-presentation", () => ({ proposalStatusPresentation: () => ({ label: "Open", tone: "neutral", icon: "clock" }) }));
vi.mock("@/app/capability-badge", () => ({ default: () => null }));
vi.mock("@/app/reports/report-form", () => ({ default: () => null }));
vi.mock("@/src/components/design/project-header", () => ({ ProjectHeader: () => null }));
vi.mock("@/src/components/design/revision-item", () => ({ RevisionItem: () => null }));
vi.mock("@/src/components/ui/badge", () => ({ StatusBadge: () => null }));
vi.mock("@/src/components/ui/section-nav", () => ({ SectionNav: () => null }));
vi.mock("./contribute-dialog", () => ({ default: () => null }));
vi.mock("./issue-board", () => ({ default: (props: unknown) => { mocks.issueBoard(props); return null; } }));
vi.mock("./project-settings-form", () => ({ default: () => null }));
vi.mock("./proposal-list", () => ({ default: () => null }));
vi.mock("./revision-publish-form", () => ({ default: () => null }));

const { default: ProjectPage } = await import("./page");

const visibleProposal = {
  id: "public-proposal",
  proposalNumber: 32,
  title: "Public proposal",
  status: "OPEN",
  project: { id: "project", ownerId: "owner", isPublic: true },
  baseRevision: { projectId: "project", isPublished: true },
  sourceRevision: { isPublished: true, project: { ownerId: "source-owner", isPublic: true } },
  appliedRevisions: [{ id: "r14", number: 14, title: "Revision 14" }],
};

function project() {
  return {
    id: "project", slug: "demo", title: "Demo", description: "A project", license: "MIT", coverUrl: "cover.png", ownerId: "owner", isPublic: true, owner: { name: "Owner" },
    revisions: [],
    issues: [{
      id: "issue-14", title: "Fix navigation", body: "Improve it", status: "OPEN", createdAt: new Date("2026-09-10T00:00:00Z"),
      author: { name: "Reporter" }, revision: null, comments: [],
      proposals: [
        visibleProposal,
        { ...visibleProposal, id: "private-proposal", title: "Private proposal", changeNames: ["Secret change"], sourceRevision: { isPublished: true, project: { ownerId: "secret-owner", isPublic: false } } },
        { ...visibleProposal, id: "unpublished-proposal", title: "Unpublished proposal", changeNames: ["Unpublished change"], sourceRevision: { isPublished: false, project: { ownerId: "source-owner", isPublic: true } } },
      ],
    }],
    forks: [], _count: { forks: 0 }, forkedFrom: null, forkedFromRevision: null, forkedFromLicense: null,
  };
}

describe("Project issue proposal visibility", () => {
  it("does not pass private or unpublished proposal metadata to IssueBoard", async () => {
    vi.clearAllMocks();
    mocks.findProject.mockResolvedValue(project());
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.listProposals.mockResolvedValue({ items: [], nextCursor: null });
    mocks.countProposals.mockResolvedValue(0);
    mocks.contributors.mockResolvedValue([]);
    mocks.findProposal.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    await renderToStaticMarkup(await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) }));

    const props = mocks.issueBoard.mock.calls.at(-1)?.[0] as { issues: Array<{ proposals?: Array<Record<string, unknown>> }> };
    expect(props.issues[0].proposals).toHaveLength(1);
    expect(props.issues[0].proposals?.[0]).toEqual({ id: "public-proposal", proposalNumber: 32, title: "Public proposal", status: "OPEN", appliedRevisions: [{ id: "r14", number: 14, title: "Revision 14" }] });
    expect(JSON.stringify(props)).not.toContain("private-proposal");
    expect(JSON.stringify(props)).not.toContain("unpublished-proposal");
    expect(JSON.stringify(props)).not.toContain("secret-owner");
    expect(JSON.stringify(props)).not.toContain("Secret change");
    expect(JSON.stringify(props)).not.toContain("Unpublished change");
  });
});
