import { Button } from "@/src/components/ui/button";
import { type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: [] as unknown[],
  stateIndex: 0,
  push: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++;
      if (index >= mocks.state.length) mocks.state.push(typeof initial === "function" ? (initial as () => unknown)() : initial);
      return [mocks.state[index], (next: unknown) => {
        mocks.state[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(mocks.state[index]) : next;
      }];
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const { default: ReleaseForm } = await import("./release-form");

function element(node: unknown): node is ReactElement<Record<string, unknown>> {
  return Boolean(node && typeof node === "object" && "type" in node && "props" in node);
}

function find(node: unknown, predicate: (item: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = find(child, predicate);
      if (match) return match;
    }
  } else if (element(node)) {
    if (predicate(node)) return node;
    return find(node.props.children, predicate);
  }
}

function renderForm() {
  mocks.stateIndex = 0;
  return ReleaseForm({ revisions: [{ id: "revision-1", number: 1, title: "First revision" }], slug: "demo" });
}

async function submit(formElement: ReactElement<Record<string, unknown>>) {
  const onSubmit = formElement.props.onSubmit as (event: unknown) => Promise<void>;
  const form = { checkValidity: () => true, querySelector: () => null };
  await onSubmit({ currentTarget: form, preventDefault: vi.fn() });
}

function response(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

beforeEach(() => {
  mocks.state = [["revision-1"], {}, "", false];
  mocks.stateIndex = 0;
  mocks.push.mockReset();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("FormData", class {
    constructor(_form: unknown) {}
    get(name: string) { return name === "title" ? "Release one" : ""; }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ReleaseForm submission recovery", () => {
  it("keeps successful submission locked and ignores another submit while navigation is pending", async () => {
    mocks.fetch.mockResolvedValue(response(201, { id: "release-1", number: 1 }));

    await submit(renderForm());
    const navigating = renderForm();
    expect(mocks.push).toHaveBeenCalledWith("/projects/demo/releases/1");
    expect(navigating.props["aria-busy"]).toBe(true);

    const submitButton = find(navigating.props.children, (item) => item.type === Button && item.props.loadingLabel === "Publishing release");
    expect(submitButton).toBeDefined();
    expect(Button(submitButton!.props as never).props.disabled).toBe(true);

    await submit(navigating);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["400", async () => response(400, { error: "Invalid release" })],
    ["409", async () => response(409, { error: "Conflict" })],
    ["network", async () => { throw new Error("offline"); }],
  ])("allows retry after a %s failure", async (_label, firstResponse) => {
    mocks.fetch.mockImplementationOnce(firstResponse).mockResolvedValueOnce(response(201, { id: "release-1", number: 1 }));

    await submit(renderForm());
    const retryable = renderForm();
    expect(retryable.props["aria-busy"]).toBe(false);

    await submit(retryable);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith("/projects/demo/releases/1");
    expect(renderForm().props["aria-busy"]).toBe(true);
  });
});
