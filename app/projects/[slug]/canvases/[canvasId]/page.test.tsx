import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findProject: vi.fn(),
  readCanvases: vi.fn(),
  canvasView: vi.fn(),
  notFoundError: new Error("NEXT_NOT_FOUND"),
}));

vi.mock("next/navigation", () => ({ notFound: () => { throw mocks.notFoundError; } }));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject } } }));
vi.mock("@/src/lib/canvas/service", async () => {
  const actual = await vi.importActual<typeof import("@/src/lib/canvas/service")>("@/src/lib/canvas/service");
  return { ...actual, readCanvases: mocks.readCanvases, canvasView: mocks.canvasView };
});

import { CanvasError } from "@/src/lib/canvas/service";
import { PrivateProjectWrite } from "@/src/lib/project-visibility-lock";
import CanvasDetailPage from "./page";

const params = Promise.resolve({ slug: "demo", canvasId: "canvas-1" });

describe("Canvas detail read failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.findProject.mockResolvedValue({ isPublic: true });
  });

  it("translates expected missing and newly-private Canvas reads to notFound", async () => {
    mocks.readCanvases.mockRejectedValueOnce(new CanvasError(404, "Canvas not found"));
    await expect(CanvasDetailPage({ params })).rejects.toBe(mocks.notFoundError);

    mocks.readCanvases.mockRejectedValueOnce(new PrivateProjectWrite());
    await expect(CanvasDetailPage({ params })).rejects.toBe(mocks.notFoundError);
  });

  it("preserves operational read failures for normal error handling", async () => {
    const failure = new Error("database unavailable");
    mocks.readCanvases.mockRejectedValueOnce(failure);
    await expect(CanvasDetailPage({ params })).rejects.toBe(failure);
  });
});
