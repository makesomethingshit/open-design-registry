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

const { Banner } = await import("@/src/components/ui/banner");
const { DesignPreview } = await import("@/src/components/design/design-preview");
const { Checkbox } = await import("@/src/components/ui/checkbox");
const { ChangeItem } = await import("@/src/components/design/change-item");
const { ReviewActionBar } = await import("@/src/components/design/review-action-bar");
const { ReviewInspector } = await import("@/src/components/design/review-inspector");
const { default: ProposalReview } = await import("./proposal-review");

const eligibleChanges = [
  { id: "still-eligible", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Home", targetFileId: "home", name: "Home", newName: null, kind: "artboard", mimeType: "image/png", size: 1, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: "Home", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "r13", reviewHistory: [], sourcePreviews: [], basePreviews: [], latestPreviews: [] },
  { id: "needs-review", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Logo", targetFileId: "logo", name: "Logo", newName: null, kind: "asset", mimeType: "image/png", size: 1, reviewStatus: "APPROVED", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: "Logo", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "r13", reviewHistory: [], sourcePreviews: [], basePreviews: [], latestPreviews: [] },
  { id: "pending-home", type: "MODIFY_UNIT", action: "MODIFY_UNIT", target: "Banner", targetFileId: "banner", name: "Banner", newName: null, kind: "artboard", mimeType: "image/png", size: 1, reviewStatus: "PENDING", reviewComment: null, reviewedBy: null, appliedRevision: null, latestAvailable: true, latestName: "Banner", conflictStatus: "NO_CONFLICT", conflictReason: "No upstream conflict.", checkedLatestRevisionId: "r13", reviewHistory: [], sourcePreviews: [], basePreviews: [], latestPreviews: [] },
] satisfies Props["changes"];

function props(): Props {
  return { proposalId: "proposal", projectSlug: "project", baseRevision: { id: "r10", number: 10, title: "Base", previews: [] }, sourceRevision: { id: "source", number: 11, title: "Source", previews: [] }, latestRevision: { id: "r13", number: 13, title: "Latest", previews: [] }, latestUnitCount: 2, stale: true, knownConflictCount: 0, unavailableConflictCount: 0, status: "APPROVED", changes: [...eligibleChanges], comments: [], signedIn: true, isOwner: true, canClose: false };
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

function render(value = props()) {
  harness.cursor = 0;
  return ProposalReview(value);
}

function find(tree: unknown, predicate: (element: Element) => boolean) {
  const element = elements(tree).find(predicate);
  if (!element) throw new Error("Expected element was not rendered");
  return element;
}

function actionBar(tree: unknown) {
  return find(tree, (element) => element.type === ReviewActionBar);
}

function inspector(tree: unknown) {
  return find(tree, (element) => element.type === ReviewInspector);
}

function selectBoth() {
  let tree = render();
  for (const item of elements(tree).filter((element) => element.type === ChangeItem)) {
    const props = item.props as { change: { id: string }; onSelect: (id: string, selected: boolean) => void };
    if (props.change.id === "pending-home") continue;
    props.onSelect(props.change.id, true);
    tree = render();
  }
  return tree;
}

describe("proposal review recovery", () => {
  beforeEach(() => {
    harness.cursor = 0;
    harness.states = [];
    harness.refs = [];
    mocks.fetch.mockReset();
    mocks.refresh.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("re-sends the failed review request unchanged on Retry", async () => {
    render();
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Could not update review." }), { status: 500 }));

    const first = inspector(render());
    await (first.props.onReview as (status: "CHANGES_REQUESTED", comment?: string) => Promise<boolean>)("CHANGES_REQUESTED", "Increase spacing around the mark.");

    const calls = mocks.fetch.mock.calls;
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ status: "CHANGES_REQUESTED", comment: "Increase spacing around the mark." });

    const failed = inspector(render());
    expect(failed.props.error).toContain("Could not update review");
    expect(failed.props.failedRequest).toEqual({ status: "CHANGES_REQUESTED", comment: "Increase spacing around the mark." });

    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    await (failed.props.onRetry as () => Promise<boolean>)();

    expect(mocks.fetch.mock.calls).toHaveLength(2);
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body as string)).toEqual({ status: "CHANGES_REQUESTED", comment: "Increase spacing around the mark." });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the failed request after navigating to another change and back", async () => {
    render();
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Could not update review." }), { status: 500 }));
    await (inspector(render()).props.onReview as (status: "APPROVED") => Promise<boolean>)("APPROVED");

    // Navigate to another change (viewChange only changes the viewed target).
    const items = elements(render()).filter((element) => element.type === ChangeItem);
    (items[1].props as unknown as { onView: (id: string) => void }).onView("needs-review");
    render();
    (elements(render()).filter((element) => element.type === ChangeItem)[0].props as unknown as { onView: (id: string) => void }).onView("still-eligible");
    render();

    const restored = inspector(render());
    expect(restored.props.failedRequest).toEqual({ status: "APPROVED", comment: "" });
    mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    await (restored.props.onRetry as () => Promise<boolean>)();
    expect(JSON.parse(mocks.fetch.mock.calls.at(-1)![1].body as string)).toEqual({ status: "APPROVED", comment: "" });
  });

  it("refreshes a review 409 without discarding unaffected selections", async () => {
    const tree = selectBoth();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "Approval needs conflict review", conflictChangeIds: ["needs-review"] }), { status: 409 }));

    const target = inspector(tree);
    await (target.props.onReview as (status: "APPROVED") => Promise<boolean>)("APPROVED");

    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(actionBar(render()).props.selectedCount).toBe(1);
    expect(inspector(render()).props.error).toBe("Approval needs conflict review");
  });

  it("exposes the Apply entrypoint contract while review stays independent", async () => {
    const tree = selectBoth();
    expect(actionBar(tree).props.selectedCount).toBe(2);

    // The Apply entrypoint contract reaches the action bar; review and selection stay
    // independent. Rendering behavior is covered by the browser tests.
    expect(actionBar(tree).props.canApply).toBe(true);
    expect(typeof actionBar(tree).props.onOpenApply).toBe("function");
    expect((inspector(tree).props.change as { reviewStatus: string }).reviewStatus).toBe("APPROVED");

    const applyCalls = mocks.fetch.mock.calls.filter((call) => String(call[0]).includes("/apply"));
    expect(applyCalls).toHaveLength(0);
  });

  it("keeps individual approved-change selection available in the mobile flow with a for-application label", () => {
    const mobileSelection = find(render(), (element) => element.type === Checkbox && String(element.props.label).includes("for application"));

    (mobileSelection.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });

    expect(actionBar(render()).props.selectedCount).toBe(1);
  });

  it("keeps application selection unchanged after an Approve against refreshed props (approve never selects)", async () => {
    selectBoth();
    // Server confirms the approval; refreshed props keep both changes Approved/unapplied.
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const target = inspector(render());
    await (target.props.onReview as (status: "APPROVED") => Promise<boolean>)("APPROVED");

    expect(mocks.refresh).toHaveBeenCalledOnce();
    // Selection is local state only; refreshed props must not add or drop it.
    expect(actionBar(render()).props.selectedCount).toBe(2);
    expect((inspector(render()).props.change as { reviewStatus: string }).reviewStatus).toBe("APPROVED");
  });

  it("does not change review state from the application checkbox", () => {
    const tree = render();
    const items = elements(tree).filter((element) => element.type === ChangeItem);
    const target = items.find((element) => ((element.props as { change: { id: string } }).change.id === "still-eligible"));
    const before = (inspector(render()).props.change as { reviewStatus: string }).reviewStatus;

    // Toggling the application checkbox routes through onSelect only.
    if (target) (target.props as unknown as { onSelect: (id: string, selected: boolean) => void }).onSelect("still-eligible", true);

    expect(target).toBeTruthy();
    expect((inspector(render()).props.change as { reviewStatus: string }).reviewStatus).toBe(before);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(actionBar(render()).props.selectedCount).toBe(1);
  });

  it("labels the actual base/latest revision pair and its absent-preview context", () => {
    let tree = render();
    const baseline = find(tree, (element) => element.type === DesignPreview);
    expect(baseline.props.previousNumber).toBe(10);
    expect(baseline.props.missingPreviousLabel).toBe("Not present in the original revision");
    expect(text(tree)).toContain("Comparing Base Revision 10 (Base) with Proposal Revision 11 (Source).");

    const warning = find(tree, (element) => element.type === Banner && String(element.props.title).includes("This proposal is based on Revision"));
    const switchButton = warning.props.action as Element;
    (switchButton.props.onClick as () => void)();

    tree = render();
    const latest = find(tree, (element) => element.type === DesignPreview);
    expect(latest.props.previousNumber).toBe(13);
    expect(latest.props.missingPreviousLabel).toBe("Not present in the latest revision");
    expect(text(tree)).toContain("Comparing Latest Revision 13 (Latest) with Proposal Revision 11 (Source).");
    expect(text(tree)).toContain("checks the proposal against current project work");

    (switchButton.props.onClick as () => void)();
    tree = render();
    expect(find(tree, (element) => element.type === DesignPreview).props.previousNumber).toBe(10);
  });

  it("does not claim a missing unit when its latest comparison could not be checked", () => {
    const value = props();
    value.changes[0] = { ...value.changes[0], conflictStatus: "CHECK_UNAVAILABLE", latestAvailable: false, latestPreviews: [] };
    const tree = render(value);
    const warning = find(tree, (element) => element.type === Banner && String(element.props.title).includes("This proposal is based on Revision"));
    ((warning.props.action as Element).props.onClick as () => void)();
    const latest = find(render(value), (element) => element.type === DesignPreview);
    expect(latest.props.previousNumber).toBe(13);
    expect(latest.props.missingPreviousLabel).toBe("Latest comparison unavailable");
    expect(actionBar(render(value)).props.selectedCount).toBe(0);
    const inspectorProps = inspector(render(value)).props as Parameters<typeof ReviewInspector>[0];
    const unavailable = ReviewInspector(inspectorProps);
    expect(elements(unavailable).some((element) => element.type === Banner && element.props.title === "Not in the latest revision")).toBe(false);
    const absent = ReviewInspector({ ...inspectorProps, change: { ...value.changes[0], conflictStatus: "NO_CONFLICT" } });
    expect(elements(absent).some((element) => element.type === Banner && element.props.title === "Not in the latest revision")).toBe(true);
  });

  it("preserves application selection when a review API call fails", async () => {
    selectBoth();
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "Could not update review." }), { status: 500 }));

    const result = await (inspector(render()).props.onReview as (status: "APPROVED") => Promise<boolean>)("APPROVED");

    expect(result).toBe(false);
    expect(actionBar(render()).props.selectedCount).toBe(2);
    expect(inspector(render()).props.error).toContain("Could not update review");
  });

  it("gates select-all on the same owner/status conditions as individual selection", () => {
    // Owner + reviewable status: select-all is available and gated on canApply.
    const bar = actionBar(render());
    expect(bar.props.canApply).toBe(true);
    expect(bar.props.applicableCount).toBeGreaterThan(0);

    // The harness cannot reset useState between renders of the same tree, so use a
    // separate mount for each gated case via a fresh harness state set.
    const gatedCases: Array<[Pick<Props, "isOwner" | "status">, string]> = [
      [{ isOwner: false, status: "OPEN" }, "non-owner"],
      [{ isOwner: true, status: "CLOSED" }, "closed"],
      [{ isOwner: true, status: "ACCEPTED" }, "accepted"],
    ];
    for (const [override, label] of gatedCases) {
      harness.cursor = 0;
      harness.states = [];
      harness.refs = [];
      const gated = ProposalReview({ ...props(), ...override });
      const gatedBar = actionBar(gated);
      expect(gatedBar.props.canApply, label).toBe(false);
      const checkboxes = elements(gated).filter((element) => element.type === Checkbox);
      expect(checkboxes.some((element) => String((element.props as { id?: string }).id) === "select-all-eligible-changes"), label).toBe(false);
    }
  });
});
