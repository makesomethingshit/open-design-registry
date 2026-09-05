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
export const issueStatusSchema = z.object({ status: z.enum(["OPEN", "CLOSED"]) });
const recordId = z.string().trim().min(1).max(200);
export const proposalCreateSchema = z.object({
  baseRevisionId: recordId,
  sourceRevisionId: recordId,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  relatedIssueId: recordId.nullable().optional(),
}).strict();
export const proposalReviewSchema = z.object({
  status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  comment: z.string().trim().max(10000).default(""),
}).strict().superRefine((value, context) => {
  if (value.status === "CHANGES_REQUESTED" && !value.comment) context.addIssue({ code: "custom", message: "A comment is required when requesting changes", path: ["comment"] });
});
export const proposalApplySchema = z.object({ reviewedLatestRevisionId: recordId.optional() }).strict();
export const proposalCloseSchema = z.object({ status: z.literal("CLOSED") }).strict();

export const imageTypes = new Set(["image/png", "image/jpeg"]);
export const previewTypes = new Set([...imageTypes, "text/html"]);
export const maxImageBytes = 10 * 1024 * 1024;

export const maxRevisionSourceBytes = 100 * 1024 * 1024;
export const maxRevisionPreviews = 10;
export const maxRevisionPreviewBytes = 10 * 1024 * 1024;
export const maxRevisionPreviewTotalBytes = 50 * 1024 * 1024;
export const revisionTitle = z.string().trim().min(1).max(120);
export const revisionChangeDescription = z.string().trim().min(1).max(500);
export const previewAltText = z.string().trim().min(1).max(500);
export const revisionTool = z.string().trim().min(1).max(80);
export const revisionToolVersion = z.string().trim().min(1).max(80);
export const revisionTag = z.string().trim().min(1).max(40);
export const revisionSourceChecksum = z.string().trim().regex(/^[0-9a-f]{64}$/i, "sourceChecksum must be a SHA-256 hex digest");
export const maxRevisionTags = 20;

export function parseRevisionTags(values: FormDataEntryValue[]) {
  if (values.some((value) => typeof value !== "string")) return { error: "Tags must be text values" } as const;
  const tags = [...new Set(values.flatMap((value) => typeof value === "string" ? value.split(/[\n,]/) : []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > maxRevisionTags) return { error: `Use no more than ${maxRevisionTags} tags` } as const;
  for (const tag of tags) {
    if (!revisionTag.safeParse(tag).success) return { error: "Each tag must be 40 characters or fewer" } as const;
  }
  return { tags } as const;
}

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
