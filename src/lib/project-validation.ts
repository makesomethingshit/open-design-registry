import { z } from "zod";

export const projectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  license: z.string().trim().min(1).max(80),
  isPublic: z.boolean().default(true),
});

export const projectUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  license: z.string().trim().min(1).max(80).optional(),
  isPublic: z.boolean().optional(),
  rightsConfirmed: z.boolean().optional(),
}).strict();

export const reportSchema = z.object({
  reason: z.string().trim().min(1).max(120),
  details: z.string().trim().max(2000).default(""),
});

export const issueSchema = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().max(10000).default(""), revisionId: z.string().trim().optional() });
export const issueCommentSchema = z.object({ body: z.string().trim().min(1).max(10000) });

export const imageTypes = new Set(["image/png", "image/jpeg"]);
export const maxImageBytes = 10 * 1024 * 1024;

export const maxRevisionSourceBytes = 100 * 1024 * 1024;
export const maxRevisionPreviews = 10;
export const maxRevisionPreviewBytes = 10 * 1024 * 1024;
export const maxRevisionPreviewTotalBytes = 50 * 1024 * 1024;
export const revisionChangeDescription = z.string().trim().max(500);

export const revisionUrlSchema = z.string().trim().url().refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "sourceUrl must use HTTP(S)");

export function validateRevisionSource(input: { hasFile: boolean; sourceUrl?: string; sourceKey?: string }) {
  if (input.sourceKey?.trim()) return "sourceKey uploads are not accepted; upload the source file instead";
  if (Number(input.hasFile) + Number(Boolean(input.sourceUrl)) !== 1) return "Provide exactly one source file or sourceUrl";
  if (input.sourceUrl && !revisionUrlSchema.safeParse(input.sourceUrl).success) return "sourceUrl must be a valid HTTP(S) URL";
}

export function slugify(value: string) {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "project";
}
