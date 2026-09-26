import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/src/components/ui/button";

const mocks = vi.hoisted(() => ({ state: [] as unknown[], stateIndex: 0, fetch: vi.fn() }));
let hasRendered = false;

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useRef: (current: unknown) => {
      const index = mocks.stateIndex++;
      if (index >= mocks.state.length) mocks.state.push({ current });
      return mocks.state[index];
    },
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++;
      if (index >= mocks.state.length) mocks.state.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [mocks.state[index], (next: unknown) => {
        mocks.state[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(mocks.state[index]) : next;
      }];
    },
  };
});
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => createElement("a", { href }, children as never) }));

const { ProjectWatchButton } = await import("./project-watch-button");

function isElement(node: unknown): node is ReactElement<Record<string, unknown>> {
  return Boolean(node && typeof node === "object" && "type" in node && "props" in node);
}

function find(node: unknown, predicate: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = find(child, predicate);
      if (match) return match;
    }
  } else if (isElement(node)) {
    if (predicate(node)) return node;
    return find(node.props.children, predicate);
  }
}

function renderControl(initialWatched = false, signedIn = true) {
  if (!hasRendered) {
    mocks.state[0] = initialWatched;
    hasRendered = true;
  }
  mocks.stateIndex = 0;
  return ProjectWatchButton({ initialWatched, signedIn, slug: "demo" });
}

function watchButton(tree: unknown) {
  const component = find(tree, (element) => element.type === Button);
  expect(component).toBeDefined();
  return Button(component!.props as never);
}

beforeEach(() => {
  mocks.state = [false, false, false, "", { current: false }];
  mocks.stateIndex = 0;
  hasRendered = false;
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("ProjectWatchButton", () => {
  it("uses a login return path for anonymous visitors", () => {
    const markup = renderToStaticMarkup(renderControl(false, false) as ReactElement);
    expect(markup).toContain('href="/login?next=%2Fprojects%2Fdemo"');
    expect(markup).toContain(">Watch</a>");
    expect(markup).not.toContain("<button");
  });

  it("is visually distinct from the Star button", async () => {
    const { ProjectStarButton } = await import("./project-star-button");
    mocks.stateIndex = 0;
    const starTree = ProjectStarButton({ initialStarred: false, signedIn: true, slug: "demo" });
     const starComponent = find(starTree, (element) => element.type === Button);
    expect((starComponent as ReactElement<Record<string, unknown>>).props.variant).toBe("secondary");
    const watchComponent = find(renderControl(), (element) => element.type === Button);
    expect((watchComponent as ReactElement<Record<string, unknown>>).props.variant).toBe("primary");
  });

  it("keeps the pressed state while pending, ignores duplicate activation, then announces success", async () => {
    let resolveRequest!: (response: { ok: boolean }) => void;
    mocks.fetch.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));

    const nativeButton = watchButton(renderControl());
    expect(nativeButton.type).toBe("button");
    expect(nativeButton.props["aria-pressed"]).toBe(false);
    const activate = nativeButton.props.onClick as () => Promise<void>;
    const request = activate();

    const pendingButton = watchButton(renderControl());
    expect(pendingButton.props.disabled).toBe(true);
    expect(pendingButton.props["aria-busy"]).toBe(true);
    expect(pendingButton.props["aria-pressed"]).toBe(false);
    await activate();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/projects/demo/watch", { method: "PUT" });

    resolveRequest({ ok: true });
    await request;
    const successTree = renderControl();
    expect(watchButton(successTree).props["aria-pressed"]).toBe(true);
    expect(renderToStaticMarkup(successTree as ReactElement)).toContain("Watching this project.");
  });

  it("starts pressed and stops watching with DELETE", async () => {
    mocks.fetch.mockResolvedValue({ ok: true });
    const initialButton = watchButton(renderControl(true));
    expect(initialButton.props["aria-pressed"]).toBe(true);
    expect(renderToStaticMarkup(initialButton)).toContain("Watching");

    await (initialButton.props.onClick as () => Promise<void>)();
    const removedTree = renderControl(true);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/projects/demo/watch", { method: "DELETE" });
    expect(watchButton(removedTree).props["aria-pressed"]).toBe(false);
    expect(renderToStaticMarkup(removedTree as ReactElement)).toContain("Stopped watching this project.");
  });

  it("preserves the prior state and exposes an alert after a failed save", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    await (watchButton(renderControl()).props.onClick as () => Promise<void>)();

    const failedTree = renderControl();
    expect(watchButton(failedTree).props["aria-pressed"]).toBe(false);
    const markup = renderToStaticMarkup(failedTree as ReactElement);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Could not update the watch. Please try again.");
  });
});
