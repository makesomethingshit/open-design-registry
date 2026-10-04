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

  it("renders uploaded document images but rejects arbitrary relative paths", () => {
    const url = "/api/assets?key=project-documents%2Fproject1%2F00000000-0000-4000-8000-000000000000.png";
    expect(renderProjectDocument(`![Design](${url})`)).toContain(`<img src="${url}" alt="Design" loading="lazy">`);
    expect(renderProjectDocument("![Bad](/api/assets?key=private-source.zip)")).not.toContain("<img");
    expect(renderProjectDocument("![Bad](/settings)")).not.toContain("<img");
  });

  it("renders tables with escaped content and inline formatting", () => {
    const html = renderProjectDocument("| Tool | Notes |\n| --- | --- |\n| **Penpot** | <script>x</script> |\n| Figma | A \\| B |\n\nAfter table");
    expect(html).toContain('<th scope="col">Tool</th>');
    expect(html).toContain("<td><strong>Penpot</strong></td>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("<td>A | B</td>");
    expect(html).toContain("</table></div>\n<p>After table</p>");
    expect(html).not.toContain("<script>");
  });

  it("keeps invalid tables and tables in code blocks inert", () => {
    expect(renderProjectDocument("| Tool | Notes |\n| --- |\n| Penpot | Open |")).not.toContain("<table>");
    expect(renderProjectDocument("```\n| Tool |\n| --- |\n``` ")).not.toContain("<table>");
  });

  it("renders headings, lists, and code without raw HTML", () => {
    const html = renderProjectDocument("# Title\n\n- one\n- two\n\n\u0060\u0060\u0060\n<script>\n\u0060\u0060\u0060");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("keeps link and image markup inside inline code inert", () => {
    const html = renderProjectDocument("`[link](https://example.com)`");
    expect(html).toContain("<code>[link](https://example.com)</code>");
    expect(html).not.toContain("<a ");
    const img = renderProjectDocument("`![alt](https://example.com/a.png)`");
    expect(img).toContain("<code>![alt](https://example.com/a.png)</code>");
    expect(img).not.toContain("<img");
  });
  it("keeps emphasis inside inline code literal", () => {
    const html = renderProjectDocument("`**bold** and *italic*`");
    expect(html).toContain("<code>**bold** and *italic*</code>");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<em>");
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
