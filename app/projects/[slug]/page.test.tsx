import { createElement, type ReactElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProject: vi.fn(),
  findForks: vi.fn(),
  findRevisions: vi.fn(),
  revisionItem: vi.fn(),
  countRevisions: vi.fn(),
  findReleases: vi.fn(),
  findIssues: vi.fn(),
  countIssues: vi.fn(),
  findDiscussions: vi.fn(),
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

vi.mock("next/navigation", () => ({ notFound: vi.fn(), usePathname: () => "/projects/demo", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject, findMany: mocks.findForks }, revision: { findMany: mocks.findRevisions, count: mocks.countRevisions }, release: { findMany: mocks.findReleases }, issue: { findMany: mocks.findIssues, count: mocks.countIssues }, discussion: { findMany: mocks.findDiscussions }, projectStar: { count: mocks.findStarCount }, projectWatch: { count: mocks.findWatchCount } } }));
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
vi.mock("@/src/components/design/revision-item", () => ({ RevisionItem: (props: unknown) => { mocks.revisionItem(props); return null; } }));
vi.mock("@/src/components/ui/badge", () => ({ Badge: ({ children }: { children: unknown }) => createElement("span", null, children as never), StatusBadge: () => null }));
vi.mock("@/src/components/ui/section-nav", () => ({ RouteNav: (props: unknown) => { mocks.sectionNav(props); return null; } }));
vi.mock("./contribute-dialog", () => ({ default: () => null }));
vi.mock("./project-star-button", () => ({ ProjectStarButton: () => null }));
vi.mock("./issue-board", () => ({ default: (props: unknown) => { mocks.issueBoard(props); return null; } }));
vi.mock("./project-settings-form", () => ({ default: () => null }));
vi.mock("./proposal-list", () => ({ default: () => null }));
vi.mock("./revision-publish-form", () => ({ default: () => null }));

const { default: ProjectPage } = await import("./project-screen");
const { default: ProjectLayout } = await import("./layout");

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

function revision(number: number) {
  return {
    id: `revision-${number}`, number, title: `Revision ${number}`, changeDescription: `Change ${number}`, tool: "Figma", toolVersion: null,
    tags: [], sourceChecksum: `checksum-${number}`, sourceKey: `source-${number}`, capabilityMode: "UNKNOWN", capabilityUnitCount: 0,
    adapterId: null, adapterVersion: null, adapterConfidence: null, adapterMaturity: null, createdAt: new Date(`2026-09-${String(number).padStart(2, "0")}T00:00:00Z`),
    publishedBy: { name: "Owner" }, previews: [{ id: `preview-${number}`, position: 0, url: `preview-${number}.png`, mimeType: "image/png", altText: null }],
    appliedProposal: null, appliedChanges: [],
  };
}

function discussion(id: string) {
  return { id, title: `Discussion ${id}`, body: "Discussion body", createdAt: new Date("2026-09-12T00:00:00Z"), author: { name: "Jisoo" }, _count: { comments: 4 } };
}

function release(number: number) {
  return { id: `release-${number}`, number, title: `Release ${number}`, description: `Description ${number}`, createdAt: new Date(`2026-09-${String(number).padStart(2, "0")}T00:00:00Z`), publishedBy: { name: "Owner" }, _count: { revisions: number } };
}

function project(withRelease = false) {
  return {
    id: "project", slug: "demo", title: "Demo", description: "A project", license: "MIT", coverUrl: "cover.png", ownerId: "owner", isPublic: true, owner: { name: "Owner" },
    revisions: [] as ReturnType<typeof revision>[],
    releases: withRelease ? [{ id: "release-3", number: 3, title: "Navigation rethink", description: "A focused change.", createdAt: new Date("2026-09-24T00:00:00Z"), publishedBy: { name: "Owner" }, _count: { revisions: 3 } }] : [],
    discussions: [
      { id: "new-discussion", title: "Mobile navigation", body: "Discussion body must stay private to the detail view", createdAt: new Date("2026-09-12T00:00:00Z"), author: { name: "Jisoo" }, _count: { comments: 4 } },
      { id: "old-discussion", title: "Color direction", createdAt: new Date("2026-09-10T00:00:00Z"), author: { name: "Min" }, _count: { comments: 1 } },
    ],
    issues: [{
      id: "issue-14", title: "Fix navigation", body: "Improve it", kind: "ISSUE", status: "OPEN", createdAt: new Date("2026-09-10T00:00:00Z"),
      author: { name: "Reporter" }, revision: null, sourceDiscussion: { id: "discussion-1", title: "Mobile navigation" }, comments: [], _count: { comments: 0 },
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
  it("keeps full issue and proposal metadata out of Overview", async () => {
    vi.clearAllMocks();
    const value = project();
    mocks.findProject.mockResolvedValue(value);
    mockProjectQueries(value);
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.listProposals.mockResolvedValue({ items: [], nextCursor: null });
    mocks.countProposals.mockResolvedValue(0);
    mocks.attribution.mockResolvedValue([
      { id: "contributor", name: "Contributor", roles: ["CONTRIBUTOR"], appliedChanges: 2, appliedRevisions: 1, reviewedChanges: 0 },
    ]);
    mocks.findProposal.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) }));

    expect(mocks.issueBoard).not.toHaveBeenCalled();
    expect(markup).not.toContain("Private proposal");
    expect(markup).not.toContain("Secret change");
    expect(markup).not.toContain("Unpublished change");
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
    mockProjectQueries(value);
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.listProposals.mockResolvedValue({ items: [], nextCursor: null });
    mocks.countProposals.mockResolvedValue(0);
    mocks.attribution.mockResolvedValue([]);
    mocks.findProposal.mockResolvedValue(null);
    mocks.readBundle.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) }));

    expect(markup).toContain("<dt>Open issues</dt><dd>2</dd>");
    expect(mocks.findIssues).toHaveBeenCalled();
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

function mockProjectQueries(value: ReturnType<typeof project>) {
  mocks.findRevisions.mockImplementation(async (args?: { orderBy?: { number?: string }; cursor?: { id: string }; skip?: number; take?: number }) => {
    const rows = [...value.revisions].sort((a, b) => a.number - b.number);
    if (args?.orderBy?.number === "desc") rows.reverse();
    return cursorPage(rows, args);
  });
  mocks.countRevisions.mockResolvedValue(value.revisions.length);
  mocks.findReleases.mockImplementation(async (args?: { cursor?: { id: string }; skip?: number; take?: number }) => cursorPage([...value.releases].sort((a, b) => b.number - a.number), args));
  mocks.findDiscussions.mockImplementation(async (args?: { cursor?: { id: string }; skip?: number; take?: number }) => cursorPage([...value.discussions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)), args));
  mocks.findForks.mockResolvedValue(value.forks);
  mocks.findIssues.mockImplementation(async (args?: { where?: { status?: string; kind?: string }; select?: { _count?: unknown }; cursor?: { id: string }; skip?: number; take?: number }) => {
    let rows = value.issues.filter((row) => (!args?.where?.status || row.status === args.where.status) && (!args?.where?.kind || row.kind === args.where.kind));
    rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    rows = cursorPage(rows, args);
    return args?.select?._count
      ? rows.map(({ id, title, kind, status, createdAt, author, _count }) => ({ id, title, kind, status, createdAt, author, _count }))
      : args?.select ? rows.slice(0, 3).map(({ id, title, author }) => ({ id, title, author })) : rows;
  });
  mocks.countIssues.mockResolvedValue(value.issues.filter((issue) => issue.status === "OPEN" && issue.kind !== "DESIGN_REQUEST").length);
}

function cursorPage<T extends { id: string }>(rows: T[], args?: { cursor?: { id: string }; skip?: number; take?: number }) {
  const cursorIndex = args?.cursor ? rows.findIndex((row) => row.id === args.cursor?.id) : -1;
  const start = cursorIndex < 0 ? 0 : cursorIndex + (args?.skip ?? 0);
  return rows.slice(start, args?.take === undefined ? undefined : start + args.take);
}

async function renderProjectPage(session: { user: { id: string } } | null, value = project(), starCount = 0, watchCount = 0, view: Parameters<typeof ProjectPage>[0]["view"] = "overview", searchParams: Awaited<Parameters<typeof ProjectPage>[0]["searchParams"]> = {}) {
  vi.clearAllMocks();
  mocks.findProject.mockResolvedValue(value);
  mockProjectQueries(value);
  mocks.getSession.mockResolvedValue(session);
  mocks.findStarCount.mockResolvedValue(starCount);
  mocks.findWatchCount.mockResolvedValue(watchCount);
  mocks.listProposals.mockResolvedValue({ items: [], nextCursor: null });
  mocks.countProposals.mockResolvedValue(0);
  mocks.attribution.mockResolvedValue([]);
  mocks.findProposal.mockResolvedValue(null);
  mocks.readBundle.mockResolvedValue(null);
  const content = await ProjectPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve(searchParams), view });
  return renderToStaticMarkup(await ProjectLayout({ params: Promise.resolve({ slug: "demo" }), children: content }));
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
    await renderProjectPage(null, project(), 0, 0, "releases");
    const props = mocks.sectionNav.mock.calls.at(-1)?.[0] as { items: Array<{ href: string }> };
    expect(props.items.map((item) => item.href).slice(1, 4)).toEqual(["/projects/demo/revisions", "/projects/demo/releases", "/projects/demo/discussions"]);
    expect(mocks.findReleases).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { number: "desc" }, select: expect.objectContaining({ _count: { select: { revisions: true } } }) }));
  });

  it("shows release rows and the publish link only to the owner", async () => {
    const releases = project(true);
    const ownerMarkup = await renderProjectPage({ user: { id: "owner" } }, releases, 0, 0, "releases");
    expect(ownerMarkup).toContain("Release 3");
    expect(ownerMarkup).toContain("Navigation rethink");
    expect(ownerMarkup).toContain("3 revisions");
    expect(ownerMarkup).toContain('href="/projects/demo/releases/3"');
    expect(ownerMarkup).toContain('href="/projects/demo/releases/new"');

    const visitorMarkup = await renderProjectPage({ user: { id: "visitor" } }, releases, 0, 0, "releases");
    expect(visitorMarkup).toContain('href="/projects/demo/releases/3"');
    expect(visitorMarkup).not.toContain('href="/projects/demo/releases/new"');
  });

  it("keeps the owner publish link in the empty state", async () => {
    const markup = await renderProjectPage({ user: { id: "owner" } }, project(), 0, 0, "releases");
    expect(markup).toContain("No releases yet.");
    expect(markup).toContain('href="/projects/demo/releases/new"');
  });
});

describe("Project Discussions section", () => {

  it("shows summary rows with title, author, created time, and comment count", async () => {
    const markup = await renderProjectPage(null, project(), 0, 0, "discussions");
    expect(markup).toContain("Mobile navigation");
    expect(markup).toContain("Jisoo");
    expect(markup).toContain("4 comments");
    expect(markup).toContain('dateTime="2026-09-12T00:00:00.000Z"');
    expect(markup).not.toContain("Discussion body must stay private to the detail view");
  });

  it("links discussion titles to their standalone detail pages", async () => {
    const markup = await renderProjectPage(null, project(), 0, 0, "discussions");
    expect(markup).toContain('href="/projects/demo/discussions/new-discussion"');
  });

  it("hides the anonymous create form and provides a login path", async () => {
    const markup = await renderProjectPage(null, project(), 0, 0, "discussions");
    expect(markup).not.toContain("<form");
    expect(markup).toContain("Sign in to start a discussion");
    expect(markup).toContain("/login?next=%2Fprojects%2Fdemo%2Fdiscussions%2Fnew");
  });

  it("shows signed-in users a link to the discussion form", async () => {
    const markup = await renderProjectPage({ user: { id: "viewer" } }, project(), 0, 0, "discussions");
    expect(markup).toContain("Start a discussion");
    expect(markup).toContain('href="/projects/demo/discussions/new"');
    expect(markup).not.toContain("<form");
  });
});

describe("Project view query contracts", () => {
  it("overview reads the base project plus latest revision, counts, and top design requests only", async () => {
    await renderProjectPage({ user: { id: "viewer" } });
    expect(mocks.findProject).toHaveBeenCalledWith({ where: { slug: "demo" }, include: { owner: { select: { name: true } } } });
    expect(mocks.findRevisions).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
    expect(mocks.countRevisions).toHaveBeenCalled();
    expect(mocks.countIssues).toHaveBeenCalled();
    expect(mocks.findReleases).not.toHaveBeenCalled();
    expect(mocks.findDiscussions).not.toHaveBeenCalled();
    expect(mocks.findForks).not.toHaveBeenCalled();
    expect(mocks.findIssues.mock.calls.length).toBeGreaterThan(0);
    for (const call of mocks.findIssues.mock.calls) {
      expect(call[0]).toHaveProperty("select");
      expect(call[0]).not.toHaveProperty("include");
    }
  });

  it("issues view applies status and a bounded comment-count-only query", async () => {
    await renderProjectPage({ user: { id: "viewer" } }, project(), 0, 0, "issues");
    expect(mocks.findIssues).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: "project", status: "OPEN" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      select: expect.objectContaining({ _count: { select: { comments: true } } }),
    }));
    const issueQuery = mocks.findIssues.mock.calls[0][0];
    expect(issueQuery).not.toHaveProperty("include");
    expect(issueQuery.select).not.toHaveProperty("comments");
    expect(issueQuery.select).not.toHaveProperty("proposals");
    expect(mocks.findRevisions).not.toHaveBeenCalled();
    expect(mocks.findReleases).not.toHaveBeenCalled();
    expect(mocks.findDiscussions).not.toHaveBeenCalled();
    expect(mocks.findForks).not.toHaveBeenCalled();
  });

  it("releases, discussions, and revisions tabs read only their own collection", async () => {
    await renderProjectPage({ user: { id: "viewer" } }, project(true), 0, 0, "releases");
    expect(mocks.findReleases).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { number: "desc" }, take: 25 }));
    expect(mocks.findIssues).not.toHaveBeenCalled();
    expect(mocks.findDiscussions).not.toHaveBeenCalled();

    await renderProjectPage({ user: { id: "viewer" } }, project(), 0, 0, "discussions");
    expect(mocks.findDiscussions).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 25 }));
    expect(mocks.findReleases).not.toHaveBeenCalled();
    expect(mocks.findIssues).not.toHaveBeenCalled();

    await renderProjectPage({ user: { id: "owner" } }, project(), 0, 0, "revisions");
    expect(mocks.findRevisions).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { number: "asc" }, take: 25 }));
    expect(mocks.findRevisions).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { number: "desc" }, take: 1, select: expect.objectContaining({ sourceKey: true, previews: expect.anything() }) }));
    expect(mocks.findIssues).not.toHaveBeenCalled();
    expect(mocks.findReleases).not.toHaveBeenCalled();
  });
});

describe("Project tab pagination", () => {
  it.each(["revisions", "releases", "issues", "discussions"] as const)("paginates %s in stable cursor order through the last page", async (view) => {
    const value = project();
    const numbered = [1, 2, 3, 4, 5];
    const ascendingIds = numbered.map((number) => `${view === "issues" ? "issue" : view === "discussions" ? "discussion" : view === "releases" ? "release" : "revision"}-${number}`);
    if (view === "revisions") value.revisions = numbered.map(revision);
    if (view === "releases") value.releases = numbered.map(release);
    if (view === "discussions") value.discussions = numbered.map((number) => discussion(`discussion-${number}`));
    if (view === "issues") value.issues = numbered.map((number) => ({ ...value.issues[0], id: `issue-${number}`, title: `Issue issue-${number}`, createdAt: new Date("2026-09-12T00:00:00Z") }));
    const pages = view === "revisions" ? [ascendingIds.slice(0, 2), ascendingIds.slice(2, 4), ascendingIds.slice(4)] : [ascendingIds.slice().reverse().slice(0, 2), ascendingIds.slice().reverse().slice(2, 4), ascendingIds.slice().reverse().slice(4)];
    const render = (cursor?: string) => renderProjectPage({ user: { id: view === "revisions" ? "owner" : "viewer" } }, value, 0, 0, view, { pageSize: "2", ...(cursor ? { cursor } : {}) });
    const rowLabel = (id: string) => view === "revisions" ? id.replace("revision-", "Revision ") : view === "releases" ? `Release ${id.replace("release-", "")}` : view === "issues" ? `Issue ${id}` : `Discussion ${id}`;
    const expectVisible = (markup: string, ids: string[]) => view === "revisions"
      ? expect(mocks.revisionItem.mock.calls.map(([props]) => (props as { href: string }).href)).toEqual(ids.map((id) => `/projects/demo/revisions/${id.replace("revision-", "")}`))
      : ids.forEach((id) => expect(markup).toContain(rowLabel(id)));

    const firstPage = await render();
    expectVisible(firstPage, pages[0]);
    if (view === "revisions") expect(mocks.revisionItem.mock.calls.map(([props]) => (props as { href: string }).href)).not.toContain(`/projects/demo/revisions/${pages[1][0].replace("revision-", "")}`);
    else expect(firstPage).not.toContain(rowLabel(pages[1][0]));
    expect(firstPage).toContain(`cursor=${pages[0][1]}`);
    expect(firstPage).not.toContain("First page");
    if (view === "releases") expect(firstPage).toContain(`href="/projects/demo/releases/${pages[0][0].replace("release-", "")}"`);
    if (view === "discussions") expect(firstPage).toContain(`href="/projects/demo/discussions/${pages[0][0]}"`);
    if (view === "issues") expect(firstPage).toContain(`href="/projects/demo/issues/${pages[0][0]}"`);

    const secondPage = await render(pages[0][1]);
    expectVisible(secondPage, pages[1]);
    expect(secondPage).toContain("First page");
    expect(secondPage).toContain(`cursor=${pages[1][1]}`);

    const lastPage = await render(pages[1][1]);
    expectVisible(lastPage, pages[2]);
    expect(lastPage).not.toContain("Next page");
    expect(lastPage).toContain("First page");
  });

  it("applies the closed issue filter in SQL and preserves it in detail and next-page links", async () => {
    const value = project();
    value.issues = [1, 2, 3].map((number) => ({ ...value.issues[0], id: `closed-${number}`, title: `Issue closed-${number}`, status: "CLOSED" }));
    const markup = await renderProjectPage({ user: { id: "viewer" } }, value, 0, 0, "issues", { issueStatus: "closed", pageSize: "2" });
    expect(markup).toContain("Issue closed-3");
    expect(markup).toContain('href="/projects/demo/issues/closed-3?issueStatus=closed"');
    expect(markup).toContain('href="/projects/demo/issues?pageSize=2&amp;cursor=closed-2&amp;issueStatus=closed"');
    expect(mocks.findIssues).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project", status: "CLOSED" } }));
  });

  it("caps each tab query at the shared maximum page size", async () => {
    for (const view of ["revisions", "releases", "issues", "discussions"] as const) {
      await renderProjectPage({ user: { id: "owner" } }, project(true), 0, 0, view, { pageSize: "1000" });
      const calls = view === "revisions" ? mocks.findRevisions.mock.calls.filter(([args]) => args.orderBy?.number === "asc")
        : view === "releases" ? mocks.findReleases.mock.calls
        : view === "issues" ? mocks.findIssues.mock.calls
        : mocks.findDiscussions.mock.calls;
      expect(calls[0][0].take).toBe(101);
    }
  });

  it("keeps latest revision source mapping separate from the visible history page", async () => {
    const value = project();
    value.revisions = [1, 2, 3, 4, 5].map(revision);
    await renderProjectPage({ user: { id: "owner" } }, value, 0, 0, "revisions", { pageSize: "2" });
    const historyQuery = mocks.findRevisions.mock.calls.find(([args]) => args.orderBy?.number === "asc")?.[0];
    const latestQuery = mocks.findRevisions.mock.calls.find(([args]) => args.orderBy?.number === "desc")?.[0];
    expect(historyQuery).toEqual(expect.objectContaining({ take: 3, select: expect.not.objectContaining({ sourceKey: true, previews: expect.anything(), appliedProposal: expect.anything() }) }));
    expect(latestQuery).toEqual(expect.objectContaining({ take: 1, select: expect.objectContaining({ sourceKey: true, previews: expect.anything(), appliedProposal: expect.anything() }) }));
    expect(mocks.readBundle).toHaveBeenCalledWith("source-5");
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
    expect(ownerMarkup).toContain("Add document");
    expect(ownerMarkup).toContain("Edit About");

    const visitorMarkup = await renderProjectPage({ user: { id: "visitor" } });
    expect(visitorMarkup).toContain("No project document has been added yet.");
    expect(visitorMarkup).not.toContain("Add document");
    expect(visitorMarkup).not.toContain("Edit About");
    expect(visitorMarkup).toContain("A revision has not been published yet.");
    expect(visitorMarkup).not.toContain('href="/projects/demo/revisions">Revisions</a>');
  });

  it("never renders raw HTML from the document", async () => {
    const value = { ...project(), document: "<script>alert(1)</script>" };
    const markup = await renderProjectPage({ user: { id: "viewer" } }, value);
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("&lt;script&gt;");
  });
});
