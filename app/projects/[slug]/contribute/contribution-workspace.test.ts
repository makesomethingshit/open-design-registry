import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { canContinueWithContext, canContinueWithWholeDocument, maxProposalChanges } = await import("./contribution-workspace");

describe("contribution workspace gating", () => {
  const ready = { currentKey: "[\"base\",\"source\"]", hasBase: true, hasSource: true, loadError: false, loadedKey: "[\"base\",\"source\"]", loading: false };

  it.each([
    [0, false],
    [1, true],
    [maxProposalChanges, true],
    [maxProposalChanges + 1, false],
  ])("gates %i selected changes as %s", (selectedCount, expected) => {
    expect(canContinueWithContext({ ...ready, selectedCount })).toBe(expected);
  });

  it("blocks changes loaded for a different revision pair or an errored request", () => {
    expect(canContinueWithContext({ ...ready, currentKey: "[\"new-base\",\"source\"]", selectedCount: 1 })).toBe(false);
    expect(canContinueWithContext({ ...ready, loadError: true, selectedCount: 1 })).toBe(false);
  });

  it("allows a changed whole-document source but blocks the copied fork and same revision", () => {
    const wholeDocument = { ...ready, hasBase: true, hasSource: true, wholeDocument: true, sameRevision: false, copiedBase: false };

    expect(canContinueWithWholeDocument(wholeDocument)).toBe(true);
    expect(canContinueWithWholeDocument({ ...wholeDocument, copiedBase: true })).toBe(false);
    expect(canContinueWithWholeDocument({ ...wholeDocument, sameRevision: true })).toBe(false);
    expect(canContinueWithWholeDocument({ ...wholeDocument, currentKey: "other" })).toBe(false);
  });
});
