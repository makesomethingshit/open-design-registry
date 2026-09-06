import { describe, expect, it } from "vitest";
import { applySuggestedKind, isCurrentSuggestionRequest, nextSuggestionRequest } from "./revision-publish-form";

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
});
