import { createElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  getSession: vi.fn(),
  listProposals: vi.fn(),
  countProposals: vi.fn(),
  attribution: vi.fn(),
  findProposal: vi.fn(),
  readBundle: vi.fn(),
  issueBoard: vi.fn(),
  sectionNav: vi.fn(),
  findStarCount: vi.fn(),
  findWatchCount: vi.fn(),
  headerActions: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject }, projectStar: { count: mocks.findStarCount }, projectWatch: { count: mocks.findWatchCount } } }));
vi.mock("@/src/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));
vi.mock("@/src/lib/revision-bundle", () => ({ publicBundleFiles: () => [], readRevisionBundle: mocks.readBundle }));
vi.mock("@/src/lib/proposal-handlers", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/proposal-handlers")>("@/src/lib/proposal-handlers");
  return { ...actual, countVisibleProposals: mocks.countProposals, findVisibleProposal: mocks.findProposal, listVisibleProposalSummaries: mocks.listProposals };
});
vi.mock("@/src/lib/attribution", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/attribution")>("@/src/lib/attribution");
  return { ...actual, listProjectAttribution: mocks.attribution };
});
vi.mock("@/src/lib/ui/status-presentation", () => ({ proposalStatusPresentation: () => ({ label: "Open", tone: "neutral", icon: "clock" }) }));
vi.mock("@/app/capability-badge", () => ({ default: () => null }));
vi.mock("@/app/reports/report-form", () => ({ default: () => null }));
vi.mock("@/src/components/design/project-header", () => ({ ProjectHeader: ({ actions }: { actions?: unknown }) => { mocks.headerActions(actions); return null; } }));
vi.mock("@/src/components/design/revision-item", () => ({ RevisionItem: () => null }));
vi.mock("@/src/components/ui/badge", () => ({ Badge: ({ children }: { children: unknown }) => createElement("span", null, children as never), StatusBadge: () => null }));
vi.mock("@/src/components/ui/section-nav", () => ({ SectionNav: (props: unknown) => { mocks.sectionNav(props); return null; } }));
vi.mock("./contribute-dialog", () => ({ default: () => null }));
vi.mock("./project-star-button", () => ({ ProjectStarButton: () => null }));
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

function project(withRelease = false) {
  return {
    id: "project", slug: "demo", title: "Demo", description: "A project", license: "MIT", coverUrl: "cover.png", ownerId: "owner", isPublic: true, owner: { name: "Owner" },
    revisions: [],
    releases: withRelease ? [{ id: "release-3", number: 3, title: "Navigation rethink", description: "A focused change.", createdAt: new Date("2026-09-24T00:00:00Z"), publishedBy: { name: "Owner" }, _count: { revisions: 3 } }] : [],
    discussions: [
      { id: "new-discussion", title: "Mobile navigation", body: "Discussion body must stay private to the detail view", createdAt: new Date("2026-09-12T00:00:00Z"), author: { name: "Jisoo" }, _count: { comments: 4 } },
      { id: "old-discussion", title: "Color direction", createdAt: new Date("2026-09-10T00:00:00Z"), author: { name: "Min" }, _count: { comments: 1 } },
    ],
    issues: [{
      id: "issue-14", title: "Fix navigation", body: "Improve it", kind: "ISSUE", status: "OPEN", createdAt: new Date("2026-09-10T00:00:00Z"),
      author: { name: "Reporter" }, revision: null, sourceDiscussion: { id: "discussion-1", title: "Mobile navigation" }, comments: [],
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
    mocks.attribution.mockResolvedValue([
      { id: "contributor", name: "Contributor", roles: ["CONTRIBUTOR"], appliedChanges: 2, appliedRevisions: 1, reviewedChanges: 0 },
    ]);
    mocks.findProposal.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) }));

    const props = mocks.issueBoard.mock.calls.at(-1)?.[0] as { issues: Array<{ proposals?: Array<Record<string, unknown>> }> };
    expect(props.issues[0].proposals).toHaveLength(1);
    expect(props.issues[0].proposals?.[0]).toEqual({ id: "public-proposal", proposalNumber: 32, title: "Public proposal", status: "OPEN", appliedRevisions: [{ id: "r14", number: 14, title: "Revision 14" }] });
    expect(JSON.stringify(props)).not.toContain("private-proposal");
    expect(JSON.stringify(props)).not.toContain("unpublished-proposal");
    expect(JSON.stringify(props)).not.toContain("secret-owner");
    expect(JSON.stringify(props)).not.toContain("Secret change");
    expect(JSON.stringify(props)).not.toContain("Unpublished change");
    expect((props.issues[0] as { sourceDiscussion?: { id: string; title: string } }).sourceDiscussion).toEqual({ id: "discussion-1", title: "Mobile navigation" });
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ issues: expect.objectContaining({ include: expect.objectContaining({ sourceDiscussion: { select: { id: true, title: true } } }) }) }) }));
    expect(markup).toContain("<dt>Contributors</dt><dd>1</dd>");
    expect(markup).toContain("Owner");
    expect(markup).toContain("Contributor");
  });

  it("counts open issues separately and shows only open design requests in the contribution section", async () => {
    vi.clearAllMocks();
    const value = project();
    value.issues = [
      { ...value.issues[0], id: "issue-1", title: "Issue one", kind: "ISSUE", status: "OPEN" },
      { ...value.issues[0], id: "issue-2", title: "Issue two", kind: "ISSUE", status: "OPEN" },
      { ...value.issues[0], id: "request-1", title: "Design request one", kind: "DESIGN_REQUEST", status: "OPEN" },
      { ...value.issues[0], id: "request-2", title: "Design request two", kind: "DESIGN_REQUEST", status: "OPEN" },
      { ...value.issues[0], id: "request-3", title: "Design request three", kind: "DESIGN_REQUEST", status: "OPEN" },
      { ...value.issues[0], id: "closed-request", title: "Closed request", kind: "DESIGN_REQUEST", status: "CLOSED" },
    ];
    mocks.findProject.mockResolvedValue(value);
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.listProposals.mockResolvedValue({ items: [], nextCursor: null });
    mocks.countProposals.mockResolvedValue(0);
    mocks.attribution.mockResolvedValue([]);
    mocks.findProposal.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) }));

    expect(markup).toContain("<dt>Open issues</dt><dd>2</dd>");
    expect(markup).toContain("Design request one");
    expect(markup).toContain("Design request two");
    expect(markup).toContain("Design request three");
    expect(markup).not.toContain("<strong>Closed request</strong>");
    expect(markup).toContain("Looking for contributions");
  });

  it("keeps Stage D geometry and responsive/F1 fixtures in the shared source", () => {
    const layoutCss = readFileSync(new URL("../../../src/components/ui/layout.module.css", import.meta.url), "utf8");
    const tokensCss = readFileSync(new URL("../../../src/styles/tokens.css", import.meta.url), "utf8");
    const catalog = readFileSync(new URL("../../../app/(internal)/design-system/catalog.tsx", import.meta.url), "utf8");
    const revisionPage = readFileSync(new URL("./revisions/[number]/page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    const legacyBridgeCss = readFileSync(new URL("../../../src/styles/legacy-bridge.css", import.meta.url), "utf8");
    const proposalCss = readFileSync(new URL("../../../app/proposals/[id]/proposal-page.module.css", import.meta.url), "utf8");
    const spanWidth = (span: number) => span * 100 + (span - 1) * 16;

    expect([spanWidth(6), spanWidth(8), spanWidth(12)]).toEqual([680, 912, 1376]);
    expect(tokensCss).toContain("--odr-layout-grid-columns: 12");
    expect(layoutCss).toContain("@media (max-width: 47.999rem)");
    expect(catalog).toContain("SAME_AS_REVISION unavailable");
    expect(revisionPage).not.toContain("WideColumn");
    expect(revisionPage).toContain("<ReadingColumn>\n      <section className=\"detail revision-visuals\" aria-label=\"Revision visual previews\">");
    expect(legacyBridgeCss).toContain(".revision-visuals .diff-side-by-side { gap: var(--odr-layout-grid-gutter); }");
    expect(legacyBridgeCss).toContain("@media (max-width: 47.999rem) { .revision-visuals .diff-side-by-side { grid-template-columns: 1fr; } }");
    expect(proposalCss).toContain("var(--odr-layout-reading, 48rem)");
    expect(catalog).toContain("Production Source Rights Read and Edit fixtures");
  });
});

async function renderProjectPage(session: { user: { id: string } } | null, value = project(), starCount = 0, watchCount = 0) {
  vi.clearAllMocks();
  mocks.findProject.mockResolvedValue(value);
  mocks.getSession.mockResolvedValue(session);
  mocks.findStarCount.mockResolvedValue(starCount);
  mocks.findWatchCount.mockResolvedValue(watchCount);
  mocks.listProposals.mockResolvedValue({ items: [], nextCursor: null });
  mocks.countProposals.mockResolvedValue(0);
  mocks.attribution.mockResolvedValue([]);
  mocks.findProposal.mockResolvedValue(null);
  mocks.readBundle.mockResolvedValue(null);
  return renderToStaticMarkup(await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) }));
}

describe("Project Star action", () => {
  it("places the current user's Star control before Contribute and Fork", async () => {
    await renderProjectPage({ user: { id: "viewer" } }, project(), 1);

    const action = mocks.headerActions.mock.calls.at(-1)?.[0] as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
    const [star, watch, contribute, fork] = action.props.children.filter(Boolean);
    expect(star.props).toEqual({ initialStarred: true, signedIn: true, slug: "demo" });
    expect(watch.props).toEqual({ initialWatched: false, signedIn: true, slug: "demo" });
    expect(contribute.props).toMatchObject({ signedIn: true, slug: "demo" });
    expect(contribute.props.initialIntent).toBeUndefined();
    expect(fork.props).toMatchObject({ initialIntent: "fork", signedIn: true, slug: "demo" });
    expect(mocks.findStarCount).toHaveBeenCalledWith({ where: { userId: "viewer", projectId: "project" } });
    expect(mocks.findWatchCount).toHaveBeenCalledWith({ where: { userId: "viewer", projectId: "project" } });
  });

  it("provides a sign-in control to anonymous viewers and hides it on private owner pages", async () => {
    await renderProjectPage(null);
    const publicActions = mocks.headerActions.mock.calls.at(-1)?.[0] as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
    expect(publicActions.props.children.filter(Boolean)[0].props).toEqual({ initialStarred: false, signedIn: false, slug: "demo" });
    expect(mocks.findStarCount).not.toHaveBeenCalled();

    const privateProject = project();
    privateProject.isPublic = false;
    await renderProjectPage({ user: { id: "owner" } }, privateProject);
    const privateActions = mocks.headerActions.mock.calls.at(-1)?.[0] as ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;
    const visibleActions = privateActions.props.children.filter(Boolean);
    expect(visibleActions).toHaveLength(2);
    expect(visibleActions[0].props).not.toHaveProperty("initialStarred");
    expect(mocks.findStarCount).not.toHaveBeenCalled();
  });
});

describe("Project Releases section", () => {
  it("places Releases between Revisions and Discussions", async () => {
    await renderProjectPage(null);
    const props = mocks.sectionNav.mock.calls.at(-1)?.[0] as { items: Array<{ href: string }> };
    expect(props.items.map((item) => item.href).slice(1, 4)).toEqual(["#revisions", "#releases", "#discussions"]);
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ releases: expect.objectContaining({ orderBy: { number: "desc" }, select: expect.objectContaining({ _count: { select: { revisions: true } } }) }) }) }));
  });

  it("shows release rows and the publish link only to the owner", async () => {
    const releases = project(true);
    const ownerMarkup = await renderProjectPage({ user: { id: "owner" } }, releases);
    expect(ownerMarkup).toContain("Release 3");
    expect(ownerMarkup).toContain("Navigation rethink");
    expect(ownerMarkup).toContain("3 revisions");
    expect(ownerMarkup).toContain('href="/projects/demo/releases/3"');
    expect(ownerMarkup).toContain('href="/projects/demo/releases/new"');

    const visitorMarkup = await renderProjectPage({ user: { id: "visitor" } }, releases);
    expect(visitorMarkup).toContain('href="/projects/demo/releases/3"');
    expect(visitorMarkup).not.toContain('href="/projects/demo/releases/new"');
  });

  it("keeps the owner publish link in the empty state", async () => {
    const markup = await renderProjectPage({ user: { id: "owner" } });
    expect(markup).toContain("No releases yet.");
    expect(markup).toContain('href="/projects/demo/releases/new"');
  });
});

describe("Project Discussions section", () => {

  it("shows summary rows with title, author, created time, and comment count", async () => {
    const markup = await renderProjectPage(null);
    expect(markup).toContain("Mobile navigation");
    expect(markup).toContain("Jisoo");
    expect(markup).toContain("4 comments");
    expect(markup).toContain('dateTime="2026-09-12T00:00:00.000Z"');
    expect(markup).not.toContain("Discussion body must stay private to the detail view");
  });

  it("links discussion titles to their standalone detail pages", async () => {
    const markup = await renderProjectPage(null);
    expect(markup).toContain('href="/projects/demo/discussions/new-discussion"');
  });

  it("hides the anonymous create form and provides a login path", async () => {
    const markup = await renderProjectPage(null);
    expect(markup).not.toContain("<form");
    expect(markup).toContain("Sign in to start a discussion");
    expect(markup).toContain("/login?next=%2Fprojects%2Fdemo%2Fdiscussions%2Fnew");
  });

  it("shows signed-in users a link to the discussion form", async () => {
    const markup = await renderProjectPage({ user: { id: "viewer" } });
    expect(markup).toContain("Start a discussion");
    expect(markup).toContain('href="/projects/demo/discussions/new"');
    expect(markup).not.toContain("<form");
  });
});

describe("Project Document section", () => {
  it("renders the saved document as sanitized HTML", async () => {
    const value = { ...project(), document: "# Doc title" };
    const markup = await renderProjectPage({ user: { id: "viewer" } }, value);
    expect(markup).toContain("Project document");
    expect(markup).toContain("<h1>Doc title</h1>");
    expect(markup).not.toContain("No project document has been added yet.");
  });

  it("shows the empty state with an owner edit CTA only to the owner", async () => {
    const ownerMarkup = await renderProjectPage({ user: { id: "owner" } });
    expect(ownerMarkup).toContain("No project document has been added yet.");
    expect(ownerMarkup).toContain("Add one in Owner tools");

    const visitorMarkup = await renderProjectPage({ user: { id: "visitor" } });
    expect(visitorMarkup).toContain("No project document has been added yet.");
    expect(visitorMarkup).not.toContain("Add one in Owner tools");
  });

  it("never renders raw HTML from the document", async () => {
    const value = { ...project(), document: "<script>alert(1)</script>" };
    const markup = await renderProjectPage({ user: { id: "viewer" } }, value);
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("&lt;script&gt;");
  });
});
