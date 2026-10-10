import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), readBundle: vi.fn() }));

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: unknown }) => createElement("a", { href }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => value }));
vi.mock("@/src/lib/revision-bundle", () => ({ publicBundleFiles: () => [], readRevisionBundle: mocks.readBundle }));
vi.mock("@/src/lib/proposal-handlers", () => ({ changeSummary: () => "", countVisibleProposals: vi.fn(), findVisibleProposal: vi.fn(), listVisibleProposalSummaries: vi.fn() }));
vi.mock("@/src/lib/attribution", () => ({ listProjectAttribution: vi.fn() }));
vi.mock("@/src/lib/ui/status-presentation", () => ({ proposalStatusPresentation: () => ({ label: "Open", tone: "neutral", icon: "clock" }) }));
vi.mock("@/src/components/design/revision-item", () => ({ RevisionItem: () => null }));
vi.mock("@/src/components/ui/badge", () => ({ Badge: ({ children }: { children: unknown }) => createElement("span", null, children as never), StatusBadge: () => null }));
vi.mock("@/src/components/ui/banner", () => ({ Banner: () => null }));
vi.mock("@/src/components/ui/layout", () => ({ FormColumn: () => null, PageGrid: () => null }));
vi.mock("@/src/components/ui/section-nav", () => ({ RouteNav: () => null }));
vi.mock("@/app/capability-badge", () => ({ default: () => null }));
vi.mock("@/app/reports/report-form", () => ({ default: () => null }));
vi.mock("./issue-board", () => ({ default: () => null }));
vi.mock("./project-document", () => ({ default: () => null }));
vi.mock("./project-about", () => ({ default: () => null }));
vi.mock("./project-settings-form", () => ({ default: () => null }));
vi.mock("./proposal-list", () => ({ default: () => null }));
vi.mock("./revision-publish-form", () => ({ default: () => null }));

const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const { prisma } = await import("@/src/lib/prisma");
const { default: ProjectScreen } = await import("./project-screen");

type Project = Awaited<ReturnType<typeof prisma.project.create>>;

function forkSlugs(markup: string) {
  return [...markup.matchAll(/href="\/projects\/([^"]+)">Fork /g)].map((match) => match[1]).filter((slug) => slug.includes("-fork-"));
}

function nextCursor(markup: string) {
  return markup.match(/href="\/projects\/[^?]+\?pageSize=20&amp;cursor=([^"]+)"/)?.[1] ?? null;
}

databaseDescribe("ProjectScreen fork pagination in PostgreSQL", () => {
  const prefix = `forks-134-${crypto.randomUUID()}`;
  const created: Project[] = [];
  let ownerId: string;

  beforeAll(async () => {
    mocks.getSession.mockResolvedValue(null);
    const owner = await prisma.user.create({ data: { id: `${prefix}-owner`, name: "Fork test owner", email: `${prefix}@example.test` } });
    ownerId = owner.id;
    for (const count of [0, 1, 20, 21, 45]) {
      const parent = await prisma.project.create({ data: { slug: `${prefix}-parent-${count}`, title: `Parent ${count}`, description: "", license: "MIT", coverUrl: "cover.png", ownerId } });
      created.push(parent);
      await prisma.project.createMany({
        data: Array.from({ length: count }, (_, index) => ({
          slug: `${prefix}-fork-${count}-${String(index + 1).padStart(3, "0")}`,
          title: `Fork ${count}-${String(index + 1).padStart(3, "0")}`,
          description: "",
          license: "MIT",
          coverUrl: "cover.png",
          ownerId,
          forkedFromProjectId: parent.id,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        })),
      });
    }
    const parent = created.at(-1)!;
    await prisma.project.createMany({
      data: [
        { slug: `${prefix}-private`, title: "Fork private", description: "", license: "MIT", coverUrl: "cover.png", ownerId, forkedFromProjectId: parent.id, isPublic: false, createdAt: new Date("2026-01-01T00:00:00Z") },
        { slug: `${prefix}-foreign`, title: "Fork foreign", description: "", license: "MIT", coverUrl: "cover.png", ownerId, forkedFromProjectId: created[0].id, createdAt: new Date("2026-01-01T00:00:00Z") },
      ],
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  async function render(parent: Project, searchParams: { pageSize?: string; cursor?: string } = {}) {
    return renderToStaticMarkup(await ProjectScreen({
      params: Promise.resolve({ slug: parent.slug }),
      searchParams: Promise.resolve(searchParams),
      view: "forks",
    }));
  }

  it("renders empty, one, twenty, and twenty-one fork parents with the shared page size", async () => {
    for (const [index, count] of [0, 1, 20, 21].entries()) {
      const markup = await render(created[index], { pageSize: "20" });
      expect(forkSlugs(markup)).toHaveLength(Math.min(count, 20));
      expect(markup.includes("Next page")).toBe(count > 20);
    }
  });

  it("walks 45 tied-timestamp public forks without duplicates or private/foreign exposure", async () => {
    const parent = created.at(-1)!;
    const pages: string[] = [];
    let cursor: string | undefined;
    do {
      const markup = await render(parent, { pageSize: "20", ...(cursor ? { cursor } : {}) });
      pages.push(markup);
      const next = nextCursor(markup);
      cursor = next ?? undefined;
    } while (cursor);

    const slugs = pages.flatMap(forkSlugs);
    expect(slugs).toHaveLength(45);
    expect(new Set(slugs).size).toBe(45);
    expect(slugs.every((slug) => slug.includes(`${prefix}-fork-45-`))).toBe(true);
    expect(pages.join(" ")).not.toContain(`${prefix}-private`);
    expect(pages.join(" ")).not.toContain(`${prefix}-foreign`);
    expect(pages.at(-1)).not.toContain("Next page");
  });

  it("treats deleted, foreign, and private cursors as first-page requests", async () => {
    const parent = created.at(-1)!;
    for (const cursor of [`${prefix}-deleted`, `${prefix}-foreign`, `${prefix}-private`]) {
      const markup = await render(parent, { pageSize: "20", cursor });
      expect(forkSlugs(markup)).toHaveLength(20);
      expect(markup).not.toContain("First page");
      expect(markup).toContain("Next page");
    }
  });
});
