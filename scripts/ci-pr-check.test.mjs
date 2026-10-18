import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkDocs, flattenPages, isDocsPath } from "./ci-pr-check.mjs";

const root = mkdtempSync(join(tmpdir(), "odr-ci-docs-"));
mkdirSync(join(root, "docs"), { recursive: true });
mkdirSync(join(root, "app", "(internal)", "design-system"), { recursive: true });
writeFileSync(join(root, "docs", "b.md"), "# B\n");
writeFileSync(join(root, "app", "(internal)", "design-system", "page.tsx"), "export {};\n");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("isDocsPath", () => {
  it("accepts only the documented Markdown paths", () => {
    expect(isDocsPath("docs/a.md")).toBe(true);
    expect(isDocsPath("docs/nested/a.md")).toBe(true);
    expect(isDocsPath("README.md")).toBe(true);
    expect(isDocsPath("ROADMAP.md")).toBe(true);
    expect(isDocsPath("docs/a.png")).toBe(false);
    expect(isDocsPath("src/a.md")).toBe(false);
    expect(isDocsPath("docs/a.md.bak")).toBe(false);
    expect(isDocsPath("package-lock.json")).toBe(false);
  });
});

describe("flattenPages", () => {
  it("flattens every page and rejects an incomplete lookup", () => {
    const pages = [[{ filename: "docs/a.md" }], [{ filename: "README.md" }]];
    expect(flattenPages(pages, 2)).toEqual(["docs/a.md", "README.md"]);
    expect(() => flattenPages(pages, 3)).toThrow(/expected 3 changed files/);
    expect(() => flattenPages([], 1)).toThrow(/no pages/);
    expect(() => flattenPages([[{ filename: "docs/a.md" }, { filename: "docs/a.md" }]], 2)).toThrow(
      /duplicate/,
    );
    expect(() => flattenPages([[{ filename: "docs/a.md" }]], 3000)).toThrow(/truncated/);
  });
});

describe("checkDocs", () => {
  it("accepts parentheses, container fences and non-relative links", () => {
    writeFileSync(
      join(root, "docs", "valid.md"),
      [
        "[B](b.md)",
        "[anchor](#section)",
        "[external](https://example.com/x)",
        "[root](/README.md)",
        "[catalog](../app/(internal)/design-system/page.tsx)",
        "`[inline](missing.md)`",
        "",
        "```md",
        "[fenced](missing.md)",
        "```",
        "",
        "> ```md",
        "> [quoted](missing.md)",
        "> ```",
        "",
        "- ```md",
        "  [listed](missing.md)",
        "  ```",
        "",
        "```md",
        "- ```",
        "> ```",
        "[still code](missing.md)",
        "```",
        "",
        "[ref]: b.md",
        "",
        "    ```md",
        "    [indented](missing.md)",
      ].join("\n"),
    );
    expect(checkDocs(["docs/valid.md"], root)).toEqual({ checked: ["docs/valid.md"], errors: [] });
  });

  it("reports missing targets, escaping links and unclosed fences", () => {
    writeFileSync(
      join(root, "docs", "broken.md"),
      "[missing](nope.md)\n[outside](../../outside.md)\n\n```md\n[x](b.md)\n",
    );
    const { errors } = checkDocs(["docs/broken.md"], root);
    expect(errors.some((error) => error.includes("missing relative link target"))).toBe(true);
    expect(errors.some((error) => error.includes("escapes the repository"))).toBe(true);
    expect(errors.some((error) => error.includes("unclosed code fence"))).toBe(true);
  });

  it("skips a documentation file deleted by the PR", () => {
    expect(checkDocs(["docs/deleted.md"], root)).toEqual({ checked: [], errors: [] });
  });

  it("checks reference-style link definitions", () => {
    writeFileSync(join(root, "docs", "refs.md"), "[guide][g]\n\n[g]: nope.md\n");
    const { errors } = checkDocs(["docs/refs.md"], root);
    expect(errors.some((error) => error.includes("nope.md"))).toBe(true);
  });

  it("does not treat a four-space indented block as a fence", () => {
    writeFileSync(join(root, "docs", "indented.md"), "    ```md\n    [code](missing.md)\n");
    expect(checkDocs(["docs/indented.md"], root)).toEqual({ checked: ["docs/indented.md"], errors: [] });
  });
});
