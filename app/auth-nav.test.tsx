import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ state: [] as unknown[], stateIndex: 0, pathname: "/stars", push: vi.fn(), refresh: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++;
      if (index >= mocks.state.length) mocks.state.push(initial);
      return [mocks.state[index], (next: unknown) => { mocks.state[index] = next; }];
    },
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("./global-search", () => ({ default: () => <form role="search" /> }));

const { default: AuthNav } = await import("./auth-nav");

function renderNav(pathname = "/stars", signedIn = true, role = "user", unread = 0) {
  mocks.pathname = pathname;
  mocks.state = [signedIn ? { name: "Jun", role } : null, unread, true, false, ""];
  mocks.stateIndex = 0;
  return renderToStaticMarkup(AuthNav({ initialTheme: "light" }));
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function findSignOutButton(node: unknown): { props: { onClick: () => Promise<void> } } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const button = findSignOutButton(child);
      if (button) return button;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: { children?: unknown; onClick?: () => Promise<void> } };
  if (element.type === "button" && element.props.children === "Sign out" && element.props.onClick) {
    return element as { props: { onClick: () => Promise<void> } };
  }
  return findSignOutButton(element.props.children);
}

function renderCurrentNav() {
  mocks.stateIndex = 0;
  return AuthNav({ initialTheme: "light" });
}

describe("AuthNav Starred link", () => {
  it("groups personal actions in a closed Account panel and marks /stars current", () => {
    const markup = renderNav();
    const positions = [
      markup.indexOf('href="/projects"'),
      markup.indexOf('href="/stars"'),
      markup.indexOf('href="/notifications"'),
      markup.indexOf('>Sign out<'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(markup).toMatch(/<a aria-current="page" href="\/stars" class="nav-link">Starred<\/a>/);
    expect(markup).toContain('aria-label="Public"');
    expect(markup).toContain('aria-controls="account-panel" aria-expanded="false" data-active="true"');
    expect(markup).toMatch(/<nav id="account-panel"[^>]*aria-label="Account" hidden=""/);
    const navStyles = readFileSync(new URL("../src/styles/legacy-bridge.css", import.meta.url), "utf8");
    expect(navStyles).toContain('.nav-link[aria-current="page"]');
  });

  it("only marks Starred current at /stars", () => {
    expect(renderNav("/projects")).not.toMatch(/<a aria-current="page" href="\/stars"/);
  });
});

describe("AuthNav account access", () => {
  it("announces Notifications and its unread count on both the closed trigger and link", () => {
    const markup = renderNav("/notifications", true, "user", 120);
    expect(markup).toContain('aria-label="Account, 120 unread notifications"');
    expect(markup).toContain('aria-label="Notifications, 120 unread"');
    expect(markup).toContain('99+');
    expect(markup).not.toContain('Activity');
  });

  it.each([
    ["a non-OK response", () => Promise.resolve({ ok: false })],
    ["a network failure", () => Promise.reject(new Error("offline"))],
  ])("keeps the user signed in and shows an Account error after %s", async (_failure, response) => {
    const signedInUser = { name: "Jun", role: "user" };
    mocks.state = [signedInUser, 0, true, true, ""];
    const fetchMock = vi.fn(response);
    vi.stubGlobal("fetch", fetchMock);

    const button = findSignOutButton(renderCurrentNav());
    expect(button).not.toBeNull();
    await button!.props.onClick();

    expect(mocks.state[0]).toEqual(signedInUser);
    expect(mocks.state[3]).toBe(true);
    const markup = renderToStaticMarkup(renderCurrentNav());
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Could not sign out. Please try again.");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("clears the user and navigates after a successful sign out", async () => {
    mocks.state = [{ name: "Jun", role: "user" }, 0, true, true, ""];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const button = findSignOutButton(renderCurrentNav());
    expect(button).not.toBeNull();
    await button!.props.onClick();

    expect(mocks.state[0]).toBeNull();
    expect(mocks.state[3]).toBe(false);
    expect(renderToStaticMarkup(renderCurrentNav())).toContain('href="/login"');
    expect(mocks.push).toHaveBeenCalledWith("/");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps Reports admin-only and leaves visitors with Sign in", () => {
    expect(renderNav()).not.toContain('href="/admin/reports"');
    expect(renderNav("/admin/reports", true, "admin")).toMatch(/aria-current="page" href="\/admin\/reports"/);
    const visitor = renderNav("/", false);
    expect(visitor).toContain('href="/login"');
    expect(visitor).not.toContain('id="account-panel"');
  });
});

describe("AuthNav Contribute link", () => {
  it("shows Contribution Discovery to visitors and marks it current", () => {
    const markup = renderNav("/contribute", false);
    expect(markup).toMatch(/<a aria-current="page" href="\/contribute" class="nav-link">Contribute<\/a>/);
    expect(markup).toContain('href="/explore"');
  });

  it("keeps Contribute and Feed available to visitors and members", () => {
    for (const signedIn of [false, true]) {
      const markup = renderNav("/feed", signedIn);
      expect(markup).toContain('href="/contribute"');
      expect(markup).toMatch(/<a aria-current="page" href="\/feed" class="nav-link">Feed<\/a>/);
    }
  });
});


describe("AuthNav public Explore", () => {
  it("keeps Explore available and current for visitors and members", () => {
    for (const signedIn of [false, true]) {
      expect(renderNav("/explore", signedIn)).toMatch(/<a aria-current="page" href="\/explore" class="nav-link">Explore<\/a>/);
    }
    expect(renderNav("/projects")).toMatch(/<a aria-current="page" href="\/projects" class="nav-link">My projects<\/a>/);
  });
});
