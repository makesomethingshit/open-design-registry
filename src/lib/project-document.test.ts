import { describe, expect, it } from "vitest";
import { MAX_PROJECT_DOCUMENT_LENGTH, renderProjectDocument } from "./project-document";
import { projectDocumentSchema, projectUpdateSchema } from "./project-validation";

describe("renderProjectDocument", () => {
  it("escapes raw HTML and script tags", () => {
    const html = renderProjectDocument('<script>alert("x")</script><b>hi</b>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects non-http(s) link and image URLs", () => {
    const html = renderProjectDocument("[evil](javascript:alert(1))\n![evil](data:text/plain,hi)");
    // Non-http(s) targets render as inert text, never as clickable markup.
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("src=");
  });

  it("allows http(s) links and images", () => {
    const html = renderProjectDocument("[docs](https://example.com)\n![alt](https://example.com/a.png)");
    expect(html).toContain('<a href="https://example.com" rel="noopener noreferrer">docs</a>');
    expect(html).toContain('<img src="https://example.com/a.png" alt="alt" loading="lazy">');
  });

  it("renders headings, lists, and code without raw HTML", () => {
    const html = renderProjectDocument("# Title\n\n- one\n- two\n\n\u0060\u0060\u0060\n<script>\n\u0060\u0060\u0060");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("project document validation", () => {
  it("accepts empty and caps length", () => {
    expect(projectDocumentSchema.safeParse("").success).toBe(true);
    expect(projectDocumentSchema.safeParse("x".repeat(MAX_PROJECT_DOCUMENT_LENGTH)).success).toBe(true);
    expect(projectDocumentSchema.safeParse("x".repeat(MAX_PROJECT_DOCUMENT_LENGTH + 1)).success).toBe(false);
  });

  it("is optional on project update and independent of description", () => {
    const parsed = projectUpdateSchema.safeParse({ document: "# Hello" });
    expect(parsed.success).toBe(true);
    expect(projectUpdateSchema.safeParse({ description: "short" }).success).toBe(true);
  });
});
