import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { imageTypes, maxImageBytes, projectSchema, projectUpdateSchema, reportSchema, revisionUrlSchema, slugify, validateRevisionSource } from "./project-validation";

describe("project validation", () => {
  it("accepts a valid project and creates a stable slug", () => {
    expect(projectSchema.parse({ title: "My New Design", license: "MIT" }).isPublic).toBe(true);
    expect(slugify("My New Design!")).toBe("my-new-design");
  });
  it("keeps image rules intentionally narrow", () => {
    expect(imageTypes.has("image/png")).toBe(true);
    expect(imageTypes.has("image/svg+xml")).toBe(false);
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
  it("requires a concise report reason", () => {
    expect(reportSchema.safeParse({ reason: "Copyright concern" }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: "" }).success).toBe(false);
  });
  it("requires one trusted source and never accepts a client object key", () => {
    expect(validateRevisionSource({ hasFile: true })).toBeUndefined();
    expect(validateRevisionSource({ hasFile: false, sourceUrl: "https://example.com/design.zip" })).toBeUndefined();
    expect(validateRevisionSource({ hasFile: true, sourceUrl: "https://example.com/design.zip" })).toMatch(/exactly one/);
    expect(validateRevisionSource({ hasFile: false, sourceKey: "staging/user/missing" })).toMatch(/sourceKey/);
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
});
