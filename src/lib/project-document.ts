// Long-form project document (README-type) helpers.
//
// Policy: Markdown subset only (headings, bold, italic, inline code, fenced
// code blocks, lists, links, images, tables). All raw HTML is escaped, never passed
// through. Images also allow owner-uploaded document asset URLs; other schemes render as
// plain text. Images get loading="lazy" and no other attributes.
import { isDocumentImageUrl } from "./project-document-images";
export const MAX_PROJECT_DOCUMENT_LENGTH = 50000;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function renderInline(source: string): string {
  // Escape first, then restore markup from escaped tokens. Code spans are
  // stashed behind placeholders so later replacements cannot turn markup
  // inside code into active HTML.
  const codeSpans: string[] = [];
  let out = escapeHtml(source.replace(/\u0000/g, ""));
  out = out.replace(/`([^`\n]+?)`/g, (match, code) => {
    codeSpans.push("<code>" + code + "</code>");
    return "\u0000" + (codeSpans.length - 1) + "\u0000";
  });
  // Images: ![alt](url) — http(s) or the document upload proxy only.
  out = out.replace(/!\[([^\]]*?)\]\(([^)\s]+?)\)/g, (match, alt, url) =>
    isHttpUrl(url) || isDocumentImageUrl(url) ? `<img src="${url}" alt="${alt}" loading="lazy">` : match,
  );
  // Links: [text](url) — http(s) only, text already escaped.
  out = out.replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, (match, label, url) =>
    isHttpUrl(url) ? `<a href="${url}" rel="noopener noreferrer">${label}</a>` : match,
  );
  // Bold then italic (escaped \* stays "*").
  out = out.replace(/\*\*([^\*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^\*])\*([^\*\n]+?)\*/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (match, index) => codeSpans[Number(index)] ?? match);
}

// Render a Markdown subset to sanitized HTML. No raw HTML passthrough.
export function renderProjectDocument(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let codeBlock: string[] | null = null;

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function closeList() {
    if (listKind) {
      html.push(listKind === "ul" ? "</ul>" : "</ol>");
      listKind = null;
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (codeBlock) {
      if (line.trim().startsWith("\u0060\u0060\u0060")) {
        html.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);
        codeBlock = null;
      } else {
        codeBlock.push(line);
      }
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith("\u0060\u0060\u0060")) {
      flushParagraph();
      closeList();
      codeBlock = [];
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const cells = tableCells(trimmed);
    const divider = tableCells(lines[index + 1] ?? "");
    if (trimmed.includes("|") && cells.length && divider.length === cells.length && divider.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      flushParagraph();
      closeList();
      html.push(`<div class="document-table"><table><thead><tr>${cells.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join("")}</tr></thead><tbody>`);
      index++;
      while (index + 1 < lines.length && lines[index + 1].trim().includes("|")) {
        const row = tableCells(lines[++index]);
        html.push(`<tr>${cells.map((_, column) => `<td>${renderInline(row[column] ?? "")}</td>`).join("")}</tr>`);
      }
      html.push("</tbody></table></div>");
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listKind !== "ul") {
        closeList();
        html.push("<ul>");
        listKind = "ul";
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }
    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listKind !== "ol") {
        closeList();
        html.push("<ol>");
        listKind = "ol";
      }
      html.push(`<li>${renderInline(ordered[2])}</li>`);
      continue;
    }
    if (listKind) closeList();
    paragraph.push(trimmed);
  }
  if (codeBlock) html.push(`<pre><code>${escapeHtml(codeBlock.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join("\n");
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}
