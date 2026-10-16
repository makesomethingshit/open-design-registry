import { describe, expect, it } from "vitest";
import { canvasCommentInputSchema, canvasExtent, canvasInitialPosition, canvasLayerEditSchema, canvasLayoutEditSchema, canvasLayoutOperationSchema, canvasRectSchema, moveCanvasRectByKeyboard } from "./spatial";

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
  it("assigns distinct bounded four-column initial positions in deterministic order", () => {
    const positions = Array.from({ length: 15_388 }, (_, index) => canvasInitialPosition(index));
    expect(positions.every(Boolean)).toBe(true);
    expect(new Set(positions.map((position) => `${position!.x}:${position!.y}`)).size).toBe(positions.length);
    expect(positions[0]).toMatchObject({ x: 0, y: 0, width: 320, height: 240, zIndex: 0, sortOrder: 0 });
    expect(positions[1]).toMatchObject({ x: 340, y: 0 });
    expect(positions[2]).toMatchObject({ x: 680, y: 0 });
    expect(positions[4]).toMatchObject({ x: 0, y: 260 });
    expect(positions[15_387]).toMatchObject({ x: 1020, y: 999_960 });
    expect(canvasInitialPosition(-1)).toBeNull();
    expect(canvasInitialPosition(15_388)).toBeNull();
    expect(canvasInitialPosition(Number.NaN)).toBeNull();
  });
  it("keeps keyboard movement inside the coordinate bounds", () => {
    expect(moveCanvasRectByKeyboard({ ...rect, x: 1_000_000 }, "ArrowRight").x).toBe(1_000_000);
    expect(moveCanvasRectByKeyboard({ ...rect, x: -1_000_000 }, "ArrowLeft").x).toBe(-1_000_000);
    expect(moveCanvasRectByKeyboard({ ...rect, y: 1_000_000 }, "ArrowDown").y).toBe(1_000_000);
    expect(moveCanvasRectByKeyboard({ ...rect, y: -1_000_000 }, "ArrowUp").y).toBe(-1_000_000);
  });
});
