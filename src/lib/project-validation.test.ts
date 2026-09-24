import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { imageTypes, issueStatusSchema, maxImageBytes, parseRevisionTags, previewAltText, previewTypes, projectSchema, projectUpdateSchema, reportSchema, revisionChangeDescription, revisionSourceChecksum, revisionTitle, revisionTool, revisionUrlSchema, slugify, validateRevisionSource } from "./project-validation";

describe("project validation", () => {
  it("accepts a valid project and creates a stable slug", () => {
    expect(projectSchema.parse({ title: "My New Design", license: "MIT" }).isPublic).toBe(true);
    expect(slugify("My New Design!")).toBe("my-new-design");
  });
  it("keeps image rules intentionally narrow", () => {
    expect(imageTypes.has("image/png")).toBe(true);
    expect(imageTypes.has("image/svg+xml")).toBe(false);
    expect(previewTypes.has("text/html")).toBe(true);
    expect(previewTypes.has("text/javascript")).toBe(false);
    expect(maxImageBytes).toBe(10 * 1024 * 1024);
  });
  it("does not add defaults during a partial project update", () => {
    const existing = { title: "old", description: "keep this", license: "MIT", isPublic: false };
    const update = projectUpdateSchema.parse({ title: "renamed" });
    expect({ ...existing, ...update }).toEqual({ title: "renamed", description: "keep this", license: "MIT", isPublic: false });
  });
  it("only accepts HTTP(S) revision sources", () => {
    expect(revisionUrlSchema.safeParse("https://example.com/design.zip").success).toBe(true);
    expect(revisionUrlSchema.safeParse("ftp://example.com/design.zip").success).toBe(false);
  });
  it("requires non-empty revision metadata within the public limits", () => {
    expect(revisionTitle.safeParse("  ").success).toBe(false);
    expect(revisionTitle.safeParse("A revision").success).toBe(true);
    expect(revisionChangeDescription.safeParse("  ").success).toBe(false);
    expect(previewAltText.safeParse("Describe this screen").success).toBe(true);
    expect(previewAltText.safeParse("x".repeat(501)).success).toBe(false);
  });
  it("normalizes and bounds revision discovery metadata", () => {
    expect(revisionTool.safeParse("Penpot").success).toBe(true);
    expect(revisionSourceChecksum.safeParse("a".repeat(64)).success).toBe(true);
    expect(parseRevisionTags(["UI, Mobile", "ui"])).toEqual({ tags: ["ui", "mobile"] });
    expect(parseRevisionTags(Array.from({ length: 21 }, (_, index) => `tag-${index}`))).toMatchObject({ error: expect.stringMatching(/20/) });
  });
  it("requires a concise report reason", () => {
    expect(reportSchema.safeParse({ reason: "Copyright concern" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "" }).success).toBe(false);
  });
  it("accepts only supported issue status changes", () => {
    expect(issueStatusSchema.safeParse({ status: "CLOSED" }).success).toBe(true);
    expect(issueStatusSchema.safeParse({ status: "DELETED" }).success).toBe(false);
  });
  it("requires one trusted source and never accepts a client object key", () => {
    expect(validateRevisionSource({ hasFile: true })).toBeUndefined();
    expect(validateRevisionSource({ hasFile: false, sourceUrl: "https://example.com/design.zip" })).toBeUndefined();
    expect(validateRevisionSource({ hasFile: true, sourceUrl: "https://example.com/design.zip" })).toMatch(/exactly one/);
    expect(validateRevisionSource({ hasFile: false, sourceKey: "staging/user/missing" })).toMatch(/sourceKey/);
  });
  it("accepts only supported activity status changes", () => {
    expect(projectUpdateSchema.safeParse({ activityStatus: "PAUSED" }).success).toBe(true);
    expect(projectUpdateSchema.safeParse({ activityStatus: "ARCHIVED" }).success).toBe(true);
    expect(projectUpdateSchema.safeParse({ activityStatus: "ACTIVE" }).success).toBe(true);
    expect(projectUpdateSchema.safeParse({ activityStatus: "Completed" }).success).toBe(false);
    expect(projectUpdateSchema.safeParse({ activityStatus: "Final" }).success).toBe(false);
    expect(projectUpdateSchema.safeParse({ activityStatus: "Stable" }).success).toBe(false);
  });
  it("declares the activity status migration without behavior-gating SQL", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260924140000_project_activity_status/migration.sql"), "utf8");
    expect(sql).toContain('CREATE TYPE "ProjectActivityStatus"');
    expect(sql).toContain("ADD COLUMN \"activityStatus\"");
    expect(sql).toContain("DEFAULT 'ACTIVE'");
    expect(sql).not.toContain("Completed");
    expect(sql).not.toMatch(/TRIGGER|CREATE FUNCTION/i);
  });
  it("keeps the revision migration deployable on a fresh project schema", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260831000000_revision_constraints/migration.sql"), "utf8");
    expect(sql.indexOf('CREATE TABLE "Revision"')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('CREATE TABLE "Preview"')).toBeGreaterThan(sql.indexOf('CREATE TABLE "Revision"'));
    expect(sql.indexOf('ALTER TABLE "Revision"')).toBeGreaterThan(sql.indexOf('CREATE TABLE "Preview"'));
    expect(sql).toContain('Revision_projectId_number_key');
    expect(sql).toContain('Revision_source_xor');
    expect(sql).toContain('Revision_immutable');
  });
  it("backfills required revision metadata before adding non-empty checks", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260831050000_revision_metadata/migration.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "title" TEXT');
    expect(sql).toContain('ADD COLUMN "altText" TEXT');
    expect(sql).toContain("No change description provided.");
    expect(sql).toContain('Revision_title_non_empty');
    expect(sql).toContain('Preview_altText_non_empty');
  });
  it("adds discovery metadata and updates revision immutability", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260904000000_revision_discovery_metadata/migration.sql"), "utf8");
    const hardeningSql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260904010000_revision_discovery_hardening/migration.sql"), "utf8");
    expect(sql).toContain('ADD COLUMN "tool" TEXT');
    expect(sql).toContain('ADD COLUMN "tags" TEXT[]');
    expect(sql).toContain('Revision_sourceChecksum_sha256');
    expect(sql).toContain('OLD."sourceChecksum"');
    expect(sql).not.toContain('Revision_sourceChecksum_idx');
    expect(hardeningSql).toContain("to_jsonb(OLD) - 'isPublished'");
    expect(hardeningSql).not.toContain('Revision_sourceChecksum_idx');
  });
  it("limits stored preview MIME types to supported formats", () => {
    const sql = readFileSync(resolve(process.cwd(), "prisma/migrations/20260831070000_html_previews/migration.sql"), "utf8");
    expect(sql).toContain('Preview_mime_type_check');
    expect(sql).toContain("'text/html'");
  });
});
