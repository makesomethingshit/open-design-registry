import { z } from "zod";

export const projectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  license: z.string().trim().min(1).max(80),
  isPublic: z.boolean().default(true),
});

export const imageTypes = new Set(["image/png", "image/jpeg"]);
export const maxImageBytes = 10 * 1024 * 1024;

export function slugify(value: string) {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "project";
}
