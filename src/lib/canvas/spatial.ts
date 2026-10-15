import { z } from "zod";

/**
 * Spatial Canvas API payload draft (#132). Validate again on the server under
 * an optimistic-version transaction; the schema alone does not prevent races.
 */
const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const dimension = z.number().finite().min(64).max(8192);

export const canvasRectSchema = z.object({
  x: coordinate, y: coordinate,
  width: dimension, height: dimension,
  zIndex: z.number().int().min(0).max(100_000),
}).strict();

export const canvasLayoutEditSchema = z.object({
  itemId: z.string().trim().min(1).max(200),
  expectedCanvasVersion: z.number().int().nonnegative(),
  rect: canvasRectSchema,
}).strict();

export const canvasCommentInputSchema = z.object({
  itemId: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
}).strict();

export type CanvasRect = z.infer<typeof canvasRectSchema>;

export function canvasExtent(rects: readonly CanvasRect[]) {
  if (!rects.length) return null;
  return {
    left: Math.min(...rects.map((rect) => rect.x)),
    top: Math.min(...rects.map((rect) => rect.y)),
    right: Math.max(...rects.map((rect) => rect.x + rect.width)),
    bottom: Math.max(...rects.map((rect) => rect.y + rect.height)),
  };
}
