import { z } from "zod";

export const rightsPermissionValues = ["UNKNOWN", "ALLOWED", "RESTRICTED", "NOT_ALLOWED"] as const;
export const sourceRightsModeValues = ["SAME_AS_REVISION", "SEPARATE", "UNKNOWN"] as const;
export const rightsItemTypeValues = ["SOURCE_FILE", "FONT", "IMAGE", "ILLUSTRATION", "ICON", "TEMPLATE", "OTHER"] as const;

const optionalText = (max: number) => z.preprocess(
  (value) => value == null || (typeof value === "string" && !value.trim()) ? undefined : value,
  z.string().trim().max(max).optional(),
);
const httpUrl = z.string().trim().url().max(2048).refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "URL must use HTTP(S)");
const optionalUrl = z.preprocess(
  (value) => value == null || (typeof value === "string" && !value.trim()) ? undefined : value,
  httpUrl.optional(),
);

export const rightsItemSchema = z.object({
  type: z.enum(rightsItemTypeValues),
  name: z.string().trim().min(1).max(200),
  sourceFileId: optionalText(200),
  rightsHolder: optionalText(200),
  licenseName: optionalText(200),
  licenseUrl: optionalUrl,
  sourceUrl: optionalUrl,
  redistribution: z.enum(rightsPermissionValues).default("UNKNOWN"),
  derivativeUse: z.enum(rightsPermissionValues).default("UNKNOWN"),
  notes: optionalText(2000),
}).strict();

export const rightsDeclarationSchema = z.object({
  sourceRightsMode: z.enum(sourceRightsModeValues).default("UNKNOWN"),
  sourceLicenseName: optionalText(200),
  sourceLicenseUrl: optionalUrl,
  sourceRightsHolder: optionalText(200),
  notes: optionalText(2000),
  items: z.array(rightsItemSchema).max(100).default([]),
}).strict().superRefine((value, context) => {
  if (value.sourceRightsMode === "SEPARATE" && !value.sourceLicenseName) {
    context.addIssue({ code: "custom", path: ["sourceLicenseName"], message: "A separate source license name is required" });
  }
  if (value.sourceRightsMode !== "SEPARATE" && value.sourceLicenseName) {
    context.addIssue({ code: "custom", path: ["sourceLicenseName"], message: "Source license name is only valid for separate source rights" });
  }
  if (value.sourceRightsMode !== "SEPARATE" && value.sourceLicenseUrl) {
    context.addIssue({ code: "custom", path: ["sourceLicenseUrl"], message: "Source license URL is only valid for separate source rights" });
  }
});

export type RightsDeclarationInput = z.infer<typeof rightsDeclarationSchema>;
export type RightsItemInput = z.infer<typeof rightsItemSchema>;

export function sourceLicenseFieldsForMode(
  mode: RightsDeclarationInput["sourceRightsMode"],
  sourceLicenseName: string,
  sourceLicenseUrl: string,
) {
  return mode === "SEPARATE" ? { sourceLicenseName, sourceLicenseUrl } : { sourceLicenseName: "", sourceLicenseUrl: "" };
}

export function parseRightsDeclaration(value: unknown) {
  const result = rightsDeclarationSchema.safeParse(value);
  return result.success ? { data: result.data } : { error: result.error.flatten().fieldErrors };
}

export function permissionLabel(permission: (typeof rightsPermissionValues)[number]) {
  return {
    UNKNOWN: "Unknown",
    ALLOWED: "Declared allowed",
    RESTRICTED: "Restricted",
    NOT_ALLOWED: "Declared not allowed",
  }[permission];
}

export function rightsItemTypeLabel(type: (typeof rightsItemTypeValues)[number]) {
  return {
    SOURCE_FILE: "Source file",
    FONT: "Font",
    IMAGE: "Image",
    ILLUSTRATION: "Illustration",
    ICON: "Icon",
    TEMPLATE: "Template",
    OTHER: "Other",
  }[type];
}

export function unknownRightsCount(declaration: { sourceRightsMode: string; items: Array<{ redistribution: string; derivativeUse: string }> } | null) {
  if (!declaration) return 0;
  return declaration.items.reduce((count, item) => count + (item.redistribution === "UNKNOWN" || item.derivativeUse === "UNKNOWN" ? 1 : 0), 0);
}
