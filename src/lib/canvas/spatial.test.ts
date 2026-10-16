import { describe, expect, it } from "vitest";
import { canvasCommentInputSchema, canvasExtent, canvasLayerEditSchema, canvasLayoutEditSchema, canvasLayoutOperationSchema, canvasRectSchema } from "./spatial";

const rect = { x: -240, y: 150, width: 400, height: 300, zIndex: 2 };

describe("Canvas spatial and comment contracts", () => {
  it("allows bounded free 2D positioning instead of a grid index", () => {
    expect(canvasRectSchema.safeParse(rect).success).toBe(true);
    expect(canvasRectSchema.safeParse({ ...rect, x: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(canvasRectSchema.safeParse({ ...rect, width: -1 }).success).toBe(false);
  });
  it("requires concurrency version and stable item ID for layout updates", () => {
    expect(canvasLayoutEditSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: 0, rect }).success).toBe(true);
    expect(canvasLayoutEditSchema.safeParse({ itemId: "item-1", rect }).success).toBe(false);
    expect(canvasLayoutEditSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: -1, rect }).success).toBe(false);
    expect(canvasLayerEditSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: 0, action: "front" }).success).toBe(true);
    expect(canvasLayerEditSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: 0, action: "back" }).success).toBe(true);
    expect(canvasLayoutOperationSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: 0, rect }).success).toBe(true);
    expect(canvasLayoutOperationSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: 0, action: "front" }).success).toBe(true);
    expect(canvasLayoutOperationSchema.safeParse({ itemId: "item-1", expectedCanvasVersion: 0, action: "sideways" }).success).toBe(false);
  });
  it("keeps feedback bound to item ID and rejects empty comments", () => {
    expect(canvasCommentInputSchema.safeParse({ itemId: "item-1", body: " Improve spacing " }).success).toBe(true);
    expect(canvasCommentInputSchema.safeParse({ itemId: "item-1", body: "   " }).success).toBe(false);
  });
  it("computes fit bounds even with negative coordinates", () => {
    expect(canvasExtent([rect, { x: 500, y: -100, width: 100, height: 100, zIndex: 3 }])).toEqual({
      left: -240, top: -100, right: 600, bottom: 450,
    });
    expect(canvasExtent([])).toBeNull();
  });
  it("computes bounds for 250,000 items without exceeding the argument limit", () => {
    const rects = Array.from({ length: 250_000 }, (_, i) => ({ x: -i, y: i, width: 64, height: 128, zIndex: 0 }));
    expect(canvasExtent(rects)).toEqual({ left: -249_999, top: 0, right: 64, bottom: 250_127 });
  });
});
