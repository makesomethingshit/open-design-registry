import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  readCanvasPage: vi.fn(),
  notFoundError: new Error("NEXT_NOT_FOUND"),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw mocks.notFoundError; } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children?: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject } } }));
vi.mock("@/src/lib/canvas/service", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/canvas/service")>("@/src/lib/canvas/service");
  return { ...actual, readCanvasPage: mocks.readCanvasPage };
});

import { CanvasError } from "@/src/lib/canvas/service";
import { PrivateProjectWrite } from "@/src/lib/project-visibility-lock";
import CanvasesPage from "./page";

describe("Canvas list page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.findProject.mockResolvedValue({ isPublic: true, ownerId: "owner" });
    mocks.readCanvasPage.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("translates expected missing and newly-private reads to notFound", async () => {
    mocks.readCanvasPage.mockRejectedValueOnce(new CanvasError(404, "Project not found"));
    await expect(CanvasesPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) })).rejects.toBe(mocks.notFoundError);

    mocks.readCanvasPage.mockRejectedValueOnce(new PrivateProjectWrite());
    await expect(CanvasesPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) })).rejects.toBe(mocks.notFoundError);
  });

  it("preserves operational read failures for normal error handling", async () => {
    const failure = new Error("database unavailable");
    mocks.readCanvasPage.mockRejectedValueOnce(failure);
    await expect(CanvasesPage({ params: Promise.resolve({ slug: "demo" }), searchParams: Promise.resolve({}) })).rejects.toBe(failure);
  });
});
