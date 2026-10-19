#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// docs/**/*.md plus the two repository-level Markdown files.
export function isDocsPath(file) {
  return /^docs\/.+\.md$/.test(file) || file === "README.md" || file === "ROADMAP.md";
}

export function classifyFiles(entries) {
  const touched = new Set();
  for (const entry of entries) {
    touched.add(entry.filename);
    if (entry.previous) touched.add(entry.previous);
  }
  return {
    docsOnly: [...touched].every(isDocsPath),
  };
}

export function flattenPages(pages, expected) {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new Error(`invalid changed_files count: ${expected}`);
  }
  // GitHub caps a PR's changed_files at 3000, so a full list cannot be trusted at the cap.
  if (expected >= 3000) {
    throw new Error(`changed_files=${expected} may be truncated by the GitHub API`);
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("PR files API returned no pages");
  }
  const entries = [];
  pages.forEach((page, index) => {
    if (!Array.isArray(page)) {
      throw new Error(`page ${index + 1} is not a JSON array`);
    }
    for (const entry of page) {
      if (!entry || typeof entry.filename !== "string" || entry.filename.length === 0) {
        throw new Error(`page ${index + 1} contains a file without a filename`);
      }
      entries.push({
        filename: entry.filename,
        previous:
          typeof entry.previous_filename === "string" ? entry.previous_filename : null,
      });
    }
  });
  if (new Set(entries.map((entry) => entry.filename)).size !== entries.length) {
    throw new Error("PR files API returned duplicate filenames");
  }
  if (entries.length !== expected) {
    throw new Error(`expected ${expected} changed files but the API returned ${entries.length}`);
  }
  return entries;
}

function checkMarkdown(file, source, root) {
  const errors = [];
  const lines = source.split(/\r?\n/);
  const stripInline = createInlineStripper();
  let fence = null;
  const comment = { open: false };

  lines.forEach((line, index) => {
    const number = index + 1;
    if (fence) {
      const marker = fenceInfo(line, fence.container ? fence.contentIndent + 3 : 3);
      if (
        marker &&
        marker.char === fence.char &&
        marker.length >= fence.length &&
        marker.info === "" &&
        !marker.listed &&
        (!marker.quoted || fence.quoted)
      ) {
        fence = null;
      }
      return;
    }

    const visible = stripHtmlComments(line, comment);
    const marker = fenceInfo(visible, 3);
    if (marker) {
      fence = { ...marker, line: number };
      return;
    }

    // shortcut: 4+ space indented lines are code, so deeply indented list links are not checked.
    if (/^(?: {4,}|\t)/.test(visible.replace(/^(?:\s{0,3}>\s?)+/, ""))) return;

    // Fenced examples and inline code are not link targets.
    const prose = stripInline(visible);
    const next = lines[index + 1] || "";
    const inline = prose.trimEnd().endsWith("](") ? `${prose}${next}` : prose;
    const inlineProse = inline === prose ? prose : createInlineStripper()(inline);
    for (const target of linkTargets(inlineProse)) {
      checkTarget(target, file, number, root, errors);
    }

    const definitionLine = visible
      .replace(/^(?:\s{0,3}>\s?)+/, "")
      .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/, "");
    const definition = definitionLine.match(/^\s{0,3}\[[^\]]+\]:\s*(.*)$/);
    if (definition) {
      const rest = definition[1].trim();
      const target = rest ? rest.split(/\s+/)[0] : next.trim().split(/\s+/)[0];
      if (target) checkTarget(target, file, number, root, errors);
    }
  });

  if (fence) errors.push(`${file}:${fence.line}: unclosed code fence`);
  return errors;
}

function checkTarget(rawTarget, file, number, root, errors) {
  let target = rawTarget.trim().replace(/\\([\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])/g, "$1");
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  if (
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    target.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  ) {
    return;
  }
  const path = target.split(/[?#]/)[0];
  if (path === "") return;
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    errors.push(`${file}:${number}: invalid URL encoding in ${target}`);
    return;
  }
  const absolute = resolve(dirname(resolve(root, file)), decoded);
  const inside = relative(root, absolute);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    errors.push(`${file}:${number}: link escapes the repository: ${target}`);
  } else if (!existsSync(absolute)) {
    errors.push(`${file}:${number}: missing relative link target: ${target}`);
  }
}

function fenceInfo(line, allowIndent) {
  let content = line;
  let container = false;
  let quoted = false;
  let listed = false;
  while (true) {
    const quote = content.match(/^\s{0,3}>\s?/);
    if (!quote) break;
    container = true;
    quoted = true;
    content = content.slice(quote[0].length);
  }
  const list = content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
  let contentIndent = 0;
  if (list) {
    container = true;
    listed = true;
    contentIndent = list[0].length;
    content = content.slice(list[0].length);
  }
  const spaces = content.match(/^\s*/)[0].length;
  if (spaces > (container ? contentIndent + 3 : allowIndent)) return null;
  content = content.slice(spaces);
  const marker = content.match(/^(`{3,}|~{3,})(.*)$/);
  if (!marker) return null;
  return {
    char: marker[1][0],
    length: marker[1].length,
    info: marker[2].trim(),
    container,
    quoted,
    listed,
    contentIndent,
  };
}

function stripHtmlComments(line, state) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.open) {
      const end = line.indexOf("-->", i);
      if (end === -1) return out;
      state.open = false;
      i = end + 3;
      continue;
    }
    const start = line.indexOf("<!--", i);
    if (start === -1) {
      out += line.slice(i);
      break;
    }
    out += line.slice(i, start);
    const end = line.indexOf("-->", start + 4);
    if (end === -1) {
      state.open = true;
      break;
    }
    i = end + 3;
  }
  return out;
}

function createInlineStripper() {
  let open = 0;
  return (line) => {
    let out = "";
    let i = 0;
    while (i < line.length) {
      if (open) {
        const closed = findBackticks(line, i, open);
        if (closed === -1) return out;
        open = 0;
        i = closed;
        continue;
      }
      if (line[i] !== "`") {
        out += line[i];
        i += 1;
        continue;
      }
      let n = 1;
      while (line[i + n] === "`") n += 1;
      const closed = findBackticks(line, i + n, n);
      if (closed === -1) {
        open = n;
        return out;
      }
      i = closed;
    }
    return out;
  };
}

function findBackticks(line, from, length) {
  let i = from;
  while (i < line.length) {
    if (line[i] !== "`") {
      i += 1;
      continue;
    }
    let n = 1;
    while (line[i + n] === "`") n += 1;
    if (n === length) return i + n;
    i += n;
  }
  return -1;
}

function linkTargets(line) {
  const targets = [];
  let cursor = 0;
  while (cursor < line.length) {
    const open = line.indexOf("](", cursor);
    if (open === -1) break;
    if (isEscaped(line, open) || !hasOpenBracket(line, open)) {
      cursor = open + 2;
      continue;
    }
    let i = open + 2;
    while (line[i] === " " || line[i] === "\t") i += 1;
    if (line[i] === "<") {
      const end = line.indexOf(">", i + 1);
      if (end === -1) break;
      targets.push(line.slice(i + 1, end));
      cursor = end + 1;
      continue;
    }
    const start = i;
    let depth = 0;
    let escaped = false;
    for (; i < line.length; i += 1) {
      const char = line[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "(") {
        depth += 1;
        continue;
      }
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
        continue;
      }
      if (/\s/.test(char) && depth === 0) break;
    }
    targets.push(line.slice(start, i));
    cursor = i + 1;
  }
  return targets;
}

function isEscaped(text, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function hasOpenBracket(text, closeIndex) {
  for (let i = closeIndex - 1; i >= 0; i -= 1) {
    if (text[i] === "[" && !isEscaped(text, i)) return true;
  }
  return false;
}

export function checkDocs(files, root = repoRoot) {
  const checked = [];
  const errors = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const absolute = resolve(root, file);
    // A docs-only PR may delete a page; there is nothing left to link-check.
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    checked.push(file);
    errors.push(...checkMarkdown(file, readFileSync(absolute, "utf8"), root));
  }
  return { checked, errors };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function writeOutput(path, values) {
  appendFileSync(path, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
}

function writeSummary(path, text) {
  if (path) appendFileSync(path, text + "\n");
}

function fullCi(reason, outputPath, summaryPath) {
  writeOutput(outputPath, { docs_only: "false" });
  writeSummary(summaryPath, `### Full CI\n\n${reason}\n`);
}

function main() {
  const pagesPath = arg("--pages");
  const expected = Number(arg("--expected"));
  const outputPath = arg("--github-output");
  const summaryPath = arg("--summary");
  const root = resolve(arg("--root") || repoRoot);
  if (!pagesPath || outputPath === undefined || !Number.isFinite(expected)) {
    console.error("usage: ci-pr-check.mjs --pages <json> --expected <count> --github-output <file> [--summary <file>]");
    process.exit(2);
  }

  let entries;
  try {
    entries = flattenPages(JSON.parse(readFileSync(pagesPath, "utf8")), expected);
  } catch (error) {
    fullCi(`Changed-file lookup is incomplete: ${error.message}. Run the full CI jobs.`, outputPath, summaryPath);
    console.error(`::error::${error.message}`);
    process.exit(1);
  }

  const files = entries.map((entry) => entry.filename);
  const { docsOnly: classifiedDocsOnly } = classifyFiles(entries);
  let docsOnly = classifiedDocsOnly;
  const docs = checkDocs(files, root);

  console.log(`Changed files (${files.length}):`);
  for (const file of files.slice(0, 100)) console.log(`- ${file}`);
  if (files.length > 100) console.log(`- ... ${files.length - 100} more`);

  // A failed docs check must not leave a docs-only skip in place.
  if (docs.errors.length > 0) docsOnly = false;

  writeOutput(outputPath, { docs_only: String(docsOnly) });

  let summary = `### Changed files (${files.length})\n\n`;
  summary += files.slice(0, 100).map((file) => `- \`${file}\``).join("\n");
  if (files.length > 100) summary += `\n- ... ${files.length - 100} more`;
  summary += "\n\n";

  if (docsOnly) {
    summary += [
      "### SKIPPED: docs-only",
      "",
      "Every changed file is documentation, so test, typecheck, build and e2e are skipped.",
      `Checked ${docs.checked.length} Markdown file(s) for relative links and balanced fences.`,
      "",
    ].join("\n");
  } else {
    summary += "### Full CI\n\nApplication, test, dependency, workflow or mixed changes require every validation job.\n\n";
  }

  if (docs.errors.length > 0) {
    summary += `### Docs validation failed\n\n${docs.errors.join("\n")}\n\nFull CI is forced.\n`;
  }
  writeSummary(summaryPath, summary);

  if (docs.errors.length > 0) {
    for (const error of docs.errors) console.error(`::error::${error}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
