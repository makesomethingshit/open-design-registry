import { describe, expect, it } from "vitest";
import { applySuggestedKind, clearRightsSourceFileIds, createNewBundleFileId, isCurrentSuggestionRequest, nextSuggestionRequest, remapRightsSourceFileId } from "./revision-publish-form";

describe("revision publish suggestions", () => {
  it("discards late results when file slots are reused", () => {
    const requests: number[] = [];
    const counter = { current: 0 };
    const first = nextSuggestionRequest(requests, counter, 0);
    const replacement = nextSuggestionRequest(requests, counter, 0);
    const beforeShrink = nextSuggestionRequest(requests, counter, 1);
    const afterRegrow = nextSuggestionRequest(requests, counter, 1);

    expect(replacement).toBeGreaterThan(first);
    expect(afterRegrow).toBeGreaterThan(beforeShrink);
    expect(isCurrentSuggestionRequest(requests, 0, first)).toBe(false);
    expect(isCurrentSuggestionRequest(requests, 1, beforeShrink)).toBe(false);
    expect(applySuggestedKind([""], 0, first, requests[0])).toEqual([""]);
    expect(applySuggestedKind([""], 0, replacement, requests[0])).toEqual(["auto"]);
  });

  it("keeps a manual kind when the current suggestion completes", () => {
    const requests: number[] = [];
    const counter = { current: 0 };
    const request = nextSuggestionRequest(requests, counter, 0);

    expect(applySuggestedKind(["asset"], 0, request, requests[0])).toEqual(["asset"]);
  });

  it("uses a fresh ID across New to Existing to New and keeps rights references aligned", () => {
    const firstNew = createNewBundleFileId();
    const existing = "existing-a";
    const finalNew = createNewBundleFileId();
    expect(finalNew).not.toBe(firstNew);

    const linked = [{ name: "Asset", sourceFileId: firstNew, type: "IMAGE" as const, redistribution: "UNKNOWN" as const, derivativeUse: "UNKNOWN" as const }];
    expect(remapRightsSourceFileId(linked, firstNew, existing)[0].sourceFileId).toBe(existing);
    expect(remapRightsSourceFileId(remapRightsSourceFileId(linked, firstNew, existing), existing, finalNew)[0].sourceFileId).toBe(finalNew);
    expect(clearRightsSourceFileIds(linked, [finalNew])[0].sourceFileId).toBe(firstNew);
    expect(clearRightsSourceFileIds([{ ...linked[0], sourceFileId: finalNew }], [finalNew])[0].sourceFileId).toBeUndefined();
  });
});
