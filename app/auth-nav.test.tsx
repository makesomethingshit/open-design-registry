import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: [] as unknown[], stateIndex: 0, pathname: "/stars", push: vi.fn(), refresh: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useEffect: () => undefined,
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++;
      if (index >= mocks.state.length) mocks.state.push(initial);
      return [mocks.state[index], (next: unknown) => { mocks.state[index] = next; }];
    },
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

const { default: AuthNav } = await import("./auth-nav");

function renderNav(pathname = "/stars") {
  mocks.pathname = pathname;
  mocks.state = [{ name: "Jun", role: "user" }, 0, true];
  mocks.stateIndex = 0;
  return renderToStaticMarkup(AuthNav());
}

beforeEach(() => vi.clearAllMocks());

describe("AuthNav Starred link", () => {
  it("places Starred between My projects and New project and marks /stars current", () => {
    const markup = renderNav();
    const positions = [
      markup.indexOf('href="/projects"'),
      markup.indexOf('href="/stars"'),
      markup.indexOf('href="/projects/new"'),
      markup.indexOf('href="/notifications"'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(markup).toMatch(/<a aria-current="page" href="\/stars" class="nav-link">Starred<\/a>/);
    const navStyles = readFileSync(new URL("../src/styles/legacy-bridge.css", import.meta.url), "utf8");
    expect(navStyles).toContain('.nav-link[aria-current="page"]');
  });

  it("only marks Starred current at /stars", () => {
    expect(renderNav("/projects")).not.toMatch(/<a aria-current="page" href="\/stars"/);
  });
});
