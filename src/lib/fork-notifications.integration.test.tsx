import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("./session", () => ({ getSession: mocks.getSession }));

if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { prisma } = await import("./prisma");
const { GET } = await import("@/app/api/notifications/route");
const { PATCH } = await import("@/app/api/notifications/[id]/route");
const { default: NotificationsPage } = await import("@/app/notifications/page");
const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;

async function fixture() {
  const suffix = crypto.randomUUID();
  const owner = await prisma.user.create({ data: { id: `owner-${suffix}`, name: "Original owner", email: `owner-${suffix}@example.test` } });
  const forker = await prisma.user.create({ data: { id: `forker-${suffix}`, name: "Fork author", email: `forker-${suffix}@example.test` } });
  const project = await prisma.project.create({ data: { slug: `original-${suffix}`, title: "Original", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: owner.id } });
  const fork = await prisma.project.create({ data: { slug: `fork-${suffix}`, title: "Public fork", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: forker.id, forkedFromProjectId: project.id } });
  const notification = await prisma.notification.create({ data: { recipientId: owner.id, actorId: forker.id, type: "FORK_CREATED", projectId: project.id, forkedProjectId: fork.id } });
  return { owner, forker, project, fork, notification };
}

databaseDescribe("Fork notification visibility in PostgreSQL", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); mocks.getSession.mockResolvedValue({ user: f.owner }); });
  afterEach(async () => {
    await prisma.project.deleteMany({ where: { id: { in: [f.fork.id, f.project.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [f.owner.id, f.forker.id] } } });
  });
  afterAll(() => prisma.$disconnect());
  const read = async () => (await GET(new Request("http://localhost/api/notifications"))).json();
  const mark = (id: string) => PATCH(new Request("http://localhost/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ read: true }) }), { params: Promise.resolve({ id }) });
  async function hidden() {
    expect(await read()).toEqual({ notifications: [], unreadCount: 0 });
    const html = renderToStaticMarkup(await NotificationsPage());
    expect(html).not.toContain(f.fork.slug);
    expect(html).not.toContain("Private renamed fork");
    expect(html).not.toContain("Fork author");
    expect((await mark(f.notification.id)).status).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: f.notification.id } })).readAt).toBeNull();
  }

  it("hides a newly private fork from API, SSR, unread count and mark-read, then restores it when public", async () => {
    expect(await read()).toMatchObject({ unreadCount: 1, notifications: [{ forkedProject: { slug: f.fork.slug, title: "Public fork" } }] });
    await prisma.project.update({ where: { id: f.fork.id }, data: { isPublic: false, title: "Private renamed fork" } });
    await hidden();
    await prisma.project.update({ where: { id: f.fork.id }, data: { isPublic: true } });
    expect(await read()).toMatchObject({ unreadCount: 1, notifications: [{ forkedProject: { title: "Private renamed fork" } }] });
    const html = renderToStaticMarkup(await NotificationsPage());
    expect(html).toContain(`/projects/${f.fork.slug}`);
    expect((await mark(f.notification.id)).status).toBe(200);
    expect((await read()).unreadCount).toBe(0);
  });

  it("keeps private originals readable by their owner and permits a private fork owned by the recipient", async () => {
    await prisma.project.update({ where: { id: f.project.id }, data: { isPublic: false } });
    expect((await read()).unreadCount).toBe(1);
    await prisma.project.update({ where: { id: f.fork.id }, data: { isPublic: false, ownerId: f.owner.id } });
    expect((await read()).unreadCount).toBe(1);
    mocks.getSession.mockResolvedValue({ user: f.forker });
    expect(await read()).toEqual({ notifications: [], unreadCount: 0 });
  });

  it("hides deleted or legacy missing forks and restores visibility when a readable fork is reattached", async () => {
    await prisma.project.delete({ where: { id: f.fork.id } });
    await hidden();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: f.notification.id } })).forkedProjectId).toBeNull();
    await prisma.project.create({ data: { id: f.fork.id, slug: f.fork.slug, title: "Restored fork", description: "", license: "MIT", coverUrl: "https://example.test/cover.png", ownerId: f.forker.id, forkedFromProjectId: f.project.id } });
    await prisma.notification.update({ where: { id: f.notification.id }, data: { forkedProjectId: f.fork.id } });
    expect((await read()).unreadCount).toBe(1);
  });

  it("hides an inaccessible original without changing unrelated notification types", async () => {
    await prisma.project.update({ where: { id: f.project.id }, data: { isPublic: false, ownerId: f.forker.id } });
    await hidden();
    const unrelated = await prisma.notification.create({ data: { recipientId: f.owner.id, actorId: f.forker.id, type: "ISSUE_CREATED", projectId: f.fork.id } });
    expect(await read()).toMatchObject({ unreadCount: 1, notifications: [{ id: unrelated.id, type: "ISSUE_CREATED" }] });
  });
});


