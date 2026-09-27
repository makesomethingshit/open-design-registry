import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findStars: vi.fn(), getSession: vi.fn(), redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: unknown }) => createElement("a", { ...props, href }, children as never) }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { projectStar: { findMany: mocks.findStars } } }));
vi.mock("@/src/lib/storage", () => ({ publicAssetUrl: (value: string) => `/asset/${value}` }));

const { default: StarsPage } = await import("./page");

type TestStar = {
  userId: string;
  createdAt: Date;
  project: {
    id: string;
    slug: string;
    title: string;
    description: string;
    license: string;
    coverUrl: string;
    activityStatus: string;
    updatedAt: Date;
    isPublic: boolean;
    owner: { name: string };
    revisions: Array<{ tags: string[] }>;
  };
};

function star(userId: string, title: string, createdAt: string, isPublic = true): TestStar {
  const slug = title.toLowerCase().replaceAll(" ", "-");
  return {
    userId,
    createdAt: new Date(createdAt),
    project: {
      id: slug,
      slug,
      title,
      description: `${title} project`,
      license: "CC BY 4.0",
      coverUrl: `${slug}.png`,
      activityStatus: "ACTIVE",
      updatedAt: new Date("2026-09-20T00:00:00Z"),
      isPublic,
      owner: { name: "Designer" },
      revisions: [{ tags: ["design"] }],
    },
  };
}

async function renderPage(rows?: TestStar[]) {
  mocks.getSession.mockResolvedValue({ user: { id: "current-user" } });
  if (rows) mocks.findStars.mockResolvedValue(rows);
  return renderToStaticMarkup(await StarsPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findStars.mockResolvedValue([]);
});

describe("Starred projects page", () => {
  it("requires a session before querying Star rows", async () => {
    mocks.getSession.mockResolvedValue(null);
    await StarsPage();
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.findStars).not.toHaveBeenCalled();
  });

  it("lists only the current user's public projects in Star creation order", async () => {
    const rows = [
      star("current-user", "Newest project", "2026-09-24T12:00:00Z"),
      star("someone-else", "Other user's project", "2026-09-25T12:00:00Z"),
      star("current-user", "Private project", "2026-09-26T12:00:00Z", false),
      star("current-user", "Older project", "2026-09-01T12:00:00Z"),
    ];
    mocks.findStars.mockImplementation(async (query: { where: { userId: string; project: { isPublic: boolean } } }) => rows
      .filter((item) => item.userId === query.where.userId && item.project.isPublic === query.where.project.isPublic)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));

    const markup = await renderPage();

    expect(mocks.findStars).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "current-user", project: { isPublic: true } },
      orderBy: { createdAt: "desc" },
    }));
    expect(markup.indexOf("Newest project")).toBeLessThan(markup.indexOf("Older project"));
    expect(markup).not.toContain("Other user's project");
    expect(markup).not.toContain("Private project");
    expect(markup).toContain("Most recently starred first");
    expect(markup).toContain("By Designer");
    expect(markup).toContain("CC BY 4.0");
    expect(markup).toContain("design");
  });

  it("hides a preserved Star while private and shows it again after republication", async () => {
    const savedStar = star("current-user", "Saved project", "2026-09-24T12:00:00Z");
    const storedRows = [savedStar];
    mocks.findStars.mockImplementation(async (query: { where: { userId: string; project: { isPublic: boolean } } }) => storedRows
      .filter((item) => item.userId === query.where.userId && item.project.isPublic === query.where.project.isPublic));

    savedStar.project.isPublic = false;
    const hiddenMarkup = await renderPage();
    expect(hiddenMarkup).not.toContain("Saved project");
    expect(storedRows).toContain(savedStar);

    savedStar.project.isPublic = true;
    const restoredMarkup = await renderPage();
    expect(restoredMarkup).toContain("Saved project");
    expect(storedRows).toEqual([savedStar]);
  });

  it("shows the exact empty message and Explore link", async () => {
    const markup = await renderPage();
    expect(markup).toContain("No starred projects yet.");
    expect(markup).toContain("Star projects you want to revisit.");
    expect(markup).toContain('href="/#projects"');
    expect(markup).toContain("Explore projects");
  });
});
