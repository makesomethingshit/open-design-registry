import { z } from "zod";

const recordId = z.string().trim().min(1).max(200);

export const releaseCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  revisionIds: z.array(recordId).min(1).max(50),
}).strict().superRefine(({ revisionIds }, context) => {
  if (new Set(revisionIds).size !== revisionIds.length) context.addIssue({ code: "custom", path: ["revisionIds"], message: "Revision IDs must be unique" });
});
