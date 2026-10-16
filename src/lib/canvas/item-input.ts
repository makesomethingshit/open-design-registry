import { z } from "zod";

/**
 * Metadata validation only (#131). The API must independently verify upload
 * bytes, MIME, object ownership, project visibility and current DB approval.
 */
const origin = z.enum(["ORIGINAL", "REFERENCE"]);
const sourceUrl = z.string().trim().max(2048).url().refine((url) => {
  const scheme = new URL(url).protocol;
  return scheme === "http:" || scheme === "https:";
}).optional();
const rightsNote = z.string().trim().max(2000).optional();

export const canvasItemTextInput = z.object({
  kind: z.literal("TEXT"),
  origin,
  body: z.string().trim().min(1).max(2000),
  sourceUrl,
  rightsNote,
}).strict();

export const canvasItemImageMetadata = z.object({
  kind: z.literal("IMAGE"),
  origin,
  altText: z.string().trim().min(1).max(500),
  sourceUrl,
  rightsNote,
}).strict();

export const canvasItemInput = z.discriminatedUnion("kind", [
  canvasItemTextInput, canvasItemImageMetadata,
]);

export const canvasImageMimeTypes = new Set(["image/png", "image/jpeg"]);
export const maxCanvasImageBytes = 10 * 1024 * 1024;
export const maxCanvasJsonRequestBytes = 64 * 1024;
export const maxCanvasMultipartRequestBytes = maxCanvasImageBytes + 64 * 1024;
