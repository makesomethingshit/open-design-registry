import type ProposalReviewComponent from "./proposal-review";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Props = Parameters<typeof ProposalReviewComponent>[0];
type Element = { type: unknown; props: Record<string, unknown> };

const harness = vi.hoisted(() => ({ cursor: 0, states: [] as unknown[], refs: [] as Array<{ current: unknown }> }));
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: ((initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.states)) harness.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(harness.states[index]) : next; }];
    }) as unknown as typeof actual.useState,
    useRef: ((initial: unknown) => {
      const index = harness.cursor++;
      return harness.refs[index] ??= { current: initial };
    }) as unknown as typeof actual.useRef,
    useMemo: ((factory: () => unknown) => factory()) as unknown as typeof actual.useMemo,
    useEffect: (() => undefined) as unknown as typeof actual.useEffect,
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/app/projects/[slug]/revision-diff", () => ({ default: () => null }));

const { default: ProposalReview } = await import("./proposal-review");

const changes = [
  { id: "still-eligible", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Home", targetFileId: "home", name: "Home", newName: null, kind: "artboard", mimeType: "image/png", size: 1, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: "Home", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "r13", reviewHistory: [], sourcePreviews: [], basePreviews: [], latestPreviews: [] },
  { id: "needs-review", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Logo", targetFileId: "logo", name: "Logo", newName: null, kind: "asset", mimeType: "image/png", size: 1, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: "Logo", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "r13", reviewHistory: [], sourcePreviews: [], basePreviews: [], latestPreviews: [] },
] satisfies Props["changes"];

function props(): Props {
  return { proposalId: "proposal", projectSlug: "project", baseRevision: { id: "r10", number: 10, title: "Base", previews: [] }, sourceRevision: { id: "source", number: 11, title: "Source", previews: [] }, latestRevision: { id: "r13", number: 13, title: "Latest", previews: [] }, latestUnitCount: 2, stale: true, knownConflictCount: 0, unavailableConflictCount: 0, status: "APPROVED", changes: [...changes], comments: [], signedIn: true, isOwner: true, canClose: false };
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return "";
}

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}

function render() {
  harness.cursor = 0;
  return ProposalReview(props());
}

function find(tree: unknown, predicate: (element: Element) => boolean) {
  const element = elements(tree).find(predicate);
  if (!element) throw new Error("Expected element was not rendered");
  return element;
}

function selectBoth() {
  let tree = render();
  for (const checkbox of elements(tree).filter((element) => element.type === "input" && typeof element.props["aria-label"] === "string" && String(element.props["aria-label"]).startsWith("Select "))) {
    (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    tree = render();
  }
  return tree;
}

describe("proposal review 409 recovery", () => {
  beforeEach(() => {
    harness.cursor = 0;
    harness.states = [];
    harness.refs = [];
    mocks.fetch.mockReset();
    mocks.refresh.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("refreshes and keeps only eligible selected changes after an Apply 409", async () => {
    let tree = selectBoth();
    (find(tree, (element) => element.type === "button" && text(element.props.children).startsWith("Apply 2 of")).props.onClick as () => void)();
    tree = render();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "Review latest changes", latestRevision: { id: "r14" }, conflictChangeIds: ["needs-review"] }), { status: 409 }));

    await (find(tree, (element) => element.type === "button" && text(element.props.children).startsWith("Apply 2 changes")).props.onClick as () => Promise<void>)();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(harness.states[5]).toEqual(["still-eligible"]);
    expect(harness.states[8]).toBe(false);
    expect(text(render())).toContain("Review latest changes");
  });

  it("refreshes a review 409 without discarding unaffected selections", async () => {
    const tree = selectBoth();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "Approval needs conflict review", conflictChangeIds: ["needs-review"] }), { status: 409 }));

    await (find(tree, (element) => element.type === "button" && text(element.props.children) === "Approve change").props.onClick as () => Promise<void>)();

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(harness.states[5]).toEqual(["still-eligible"]);
    expect(text(render())).toContain("Approval needs conflict review");
  });
});
