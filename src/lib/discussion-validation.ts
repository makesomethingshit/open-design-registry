import { z } from "zod";

export const discussionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(10000).default(""),
}).strict();

export const discussionCommentSchema = z.object({
  body: z.string().trim().min(1).max(10000),
}).strict();
