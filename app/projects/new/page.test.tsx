import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }),
}));
vi.mock("@/src/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn() }) }));

const { default: NewProjectPage } = await import("./page");

describe("project creation authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires sign-in with a return path before exposing the form", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(NewProjectPage()).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fprojects%2Fnew");
  });

  it("renders the creation form for a signed-in user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "owner" } });
    const html = renderToStaticMarkup(await NewProjectPage());
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(html).toContain('name="title"');
    expect(html).toContain('name="cover"');
    expect(html).toContain("Create project");
  });
});
