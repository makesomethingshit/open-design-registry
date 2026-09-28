import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children?: unknown } & Record<string, unknown>) =>
    createElement("a", props as never, children as never),
}));

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.CI && !testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required in CI");
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
const describePostgres = testDatabaseUrl ? describe : describe.skip;

describePostgres("Contribute image-preview MIME selection", () => {
  const prisma = new PrismaClient();
  const uid = crypto.randomUUID();
  const userId = `contrib-mime-user-${uid}`;
  const projectId = `contrib-mime-project-${uid}`;
  const revisionId = `contrib-mime-revision-${uid}`;
  const htmlToken = `contrib-mime-${uid}-html-doc`;
  const pngToken = `contrib-mime-${uid}-png-img`;
  const requestTitle = `Contrib MIME request ${uid}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, name: "Contrib MIME test", email: `${userId}@example.test` } });
    await prisma.project.create({
      data: { id: projectId, slug: projectId, title: "Contrib MIME project", description: "", license: "MIT", coverUrl: "https://example.test/contrib-mime-cover.png", ownerId: userId },
    });
    await prisma.revision.create({
      data: {
        id: revisionId,
        projectId,
        number: 1,
        title: "Contrib MIME revision",
        changeDescription: "HTML preview first, PNG second",
        sourceUrl: "https://example.test/contrib-mime-source.zip",
        isPublished: false,
        previews: {
          create: [
            { position: 0, key: `contrib-mime-html-${uid}`, url: `https://example.test/${htmlToken}.html`, mimeType: "text/html", size: 32, altText: "HTML preview" },
            { position: 1, key: `contrib-mime-png-${uid}`, url: `https://example.test/${pngToken}.png`, mimeType: "image/png", size: 1, altText: "" },
          ],
        },
      },
    });
    await prisma.revision.update({ where: { id: revisionId }, data: { isPublished: true } });
    await prisma.issue.create({
      data: { projectId, authorId: userId, revisionId, title: requestTitle, body: "Pick the PNG preview, not the HTML one.", kind: "DESIGN_REQUEST" },
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("renders the PNG preview and never the HTML preview URL", async () => {
    const { default: ContributePage } = await import("./page");
    const markup = renderToStaticMarkup(await ContributePage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain(requestTitle);
    expect(markup).toContain(pngToken);
    expect(markup).toContain("Revision 1 preview");
    expect(markup).toContain("linked to this request");
    expect(markup).not.toContain(htmlToken);
  });
});
