import { describe, expect, it } from "vitest";
import { defaultPageSize, maxPageSize, pageCursor, paginationRequested, parsePageSize } from "./pagination";

describe("listing pagination", () => {
  it("clamps page sizes and recognizes cursor requests", () => {
    expect(parsePageSize(null)).toBe(defaultPageSize);
    expect(parsePageSize("1000")).toBe(maxPageSize);
    expect(parsePageSize("0")).toBe(defaultPageSize);
    expect(pageCursor("  project-slug ")).toBe("project-slug");
    expect(paginationRequested(new URLSearchParams("limit=10"))).toBe(true);
  });
});
