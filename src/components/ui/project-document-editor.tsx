"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { renderProjectDocument } from "@/src/lib/project-document";
import { Button } from "./button";
import { Input, Textarea } from "./field";
import styles from "./project-document-editor.module.css";

type TableDraft = { start: number; end: number; cells: string[][] };
type Props = Omit<ComponentPropsWithoutRef<"textarea">, "onChange" | "value"> & { slug: string; value: string; onChange: (value: string) => void; onBusyChange?: (busy: boolean) => void };

export function ProjectDocumentEditor({ slug, value, onChange, onBusyChange, disabled, ...props }: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [table, setTable] = useState<TableDraft | null>(null);
  const busy = disabled || uploading || Boolean(table);
  useEffect(() => { onBusyChange?.(uploading || Boolean(table)); }, [uploading, table, onBusyChange]);
  const images: RegExpMatchArray[] = [];
  const tables: TableDraft[] = [];
  const lines = value.split("\n");
  let imageOffset = 0;
  let imageFence = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) imageFence = !imageFence;
    else if (!imageFence) {
      const literals = [...line.matchAll(/`[^`\n]+`/g)];
      for (const image of line.matchAll(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g)) {
        if (!literals.some((literal) => image.index! >= literal.index! && image.index! < literal.index! + literal[0].length)) {
          image.index = imageOffset + image.index!; images.push(image);
        }
      }
    }
    imageOffset += line.length + 1;
  }
  let offset = 0;
  let fenced = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim().startsWith("```")) fenced = !fenced;
    const divider = readCells(lines[index + 1] ?? "");
    if (!fenced && line.includes("|") && divider.length === readCells(line).length && divider.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      const start = offset;
      const cells = [readCells(line)];
      offset += line.length + 1 + lines[++index].length + 1;
      while (lines[index + 1]?.includes("|")) {
        const row = lines[++index];
        cells.push(readCells(row));
        offset += row.length + 1;
      }
      tables.push({ start, end: Math.min(value.length, offset), cells });
      continue;
    }
    offset += line.length + 1;
  }

  function replace(start: number, end: number, text: string) {
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > 50000) { setError("Keep the project document within 50,000 characters."); return false; }
    onChange(next);
    setPreview(false);
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(start + text.length, start + text.length); });
    return true;
  }

  async function upload(selected: File[]) {
    if (busy || !selected.length) return;
    setError("");
    if (selected.length > 10 || selected.some((file) => !["image/png", "image/jpeg"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      setError("Choose up to 10 PNG or JPG images, each up to 10MB."); return;
    }
    const start = field.current?.selectionStart ?? value.length;
    const end = field.current?.selectionEnd ?? value.length;
    setUploading(true);
    const inserted: string[] = [];
    try {
      for (const file of selected) {
        const form = new FormData(); form.set("image", file);
        const response = await fetch(`/api/projects/${slug}/document-images`, { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not upload the image.");
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\[\]\\\n]/g, " ");
        inserted.push(`![${alt}](${result.url})`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the image. Try again.");
    } finally {
      if (inserted.length) replace(start, end, `\n\n${inserted.join("\n\n")}\n\n`);
      setUploading(false);
    }
  }

  return <div className={styles.editor}>
    <div className={styles.toolbar}>
      <div role="group" aria-label="Document editing mode">
        <Button aria-pressed={!preview} disabled={Boolean(table)} onClick={() => setPreview(false)} size="sm" variant={preview ? "ghost" : "secondary"}>Write</Button>
        <Button aria-pressed={preview} disabled={Boolean(table)} onClick={() => setPreview(true)} size="sm" variant={preview ? "secondary" : "ghost"}>Preview</Button>
      </div>
      <div className={styles.tools}>
        <Button disabled={busy} loading={uploading} loadingLabel="Uploading image" onClick={() => files.current?.click()} size="sm" variant="secondary">Add image</Button>
        <Button disabled={busy} onClick={() => { setPreview(false); setTable({ start: field.current?.selectionStart ?? value.length, end: field.current?.selectionEnd ?? value.length, cells: [["Column 1", "Column 2"], ["", ""]] }); }} size="sm" variant="secondary">Insert table</Button>
      </div>
    </div>
    <input accept="image/png,image/jpeg" aria-label="Upload document images" hidden multiple onChange={(event) => { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }} ref={files} type="file" />
    {preview ? <div aria-label="Document preview" className={`${styles.prose} ${styles.preview}`} dangerouslySetInnerHTML={{ __html: renderProjectDocument(value) || "<p>Nothing to preview yet.</p>" }} /> : <Textarea {...props} disabled={busy} maxLength={50000} onChange={(event) => onChange(event.target.value)} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); } }} onPaste={(event) => { const pasted = Array.from(event.clipboardData.files); if (pasted.length) { event.preventDefault(); void upload(pasted); } }} ref={field} rows={12} value={value} />}
    <p className={styles.hint}>Write with Markdown, or paste and drop PNG/JPG images. Use Preview to check the result.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {table && <section aria-label="Table editor" className={styles.tableEditor}>
      <div className={styles.tableScroll}><table><tbody>{table.cells.map((row, rowIndex) => <tr key={rowIndex}>{Array.from({ length: table.cells[0].length }, (_, column) => <td key={column}><Input aria-label={rowIndex === 0 ? `Header ${column + 1}` : `Row ${rowIndex}, column ${column + 1}`} onChange={(event) => setTable({ ...table, cells: table.cells.map((cells, index) => index === rowIndex ? Array.from({ length: table.cells[0].length }, (_, cell) => cell === column ? event.target.value : cells[cell] ?? "") : cells) })} value={row[column] ?? ""} /></td>)}</tr>)}</tbody></table></div>
      <div className={styles.tools}>
        <Button disabled={table.cells.length >= 21} onClick={() => setTable({ ...table, cells: [...table.cells, table.cells[0].map(() => "")] })} size="sm" variant="secondary">Add row</Button>
        <Button disabled={table.cells[0].length >= 8} onClick={() => setTable({ ...table, cells: table.cells.map((row) => Array.from({ length: table.cells[0].length + 1 }, (_, column) => row[column] ?? "")) })} size="sm" variant="secondary">Add column</Button>
        <Button disabled={table.cells.length <= 2} onClick={() => setTable({ ...table, cells: table.cells.slice(0, -1) })} size="sm" variant="ghost">Remove last row</Button>
        <Button disabled={table.cells[0].length <= 1} onClick={() => setTable({ ...table, cells: table.cells.map((row) => row.slice(0, -1)) })} size="sm" variant="ghost">Remove last column</Button>
      </div>
      <div className={styles.actions}><Button onClick={() => setTable(null)} variant="secondary">Cancel table</Button><Button onClick={() => { const rows = table.cells.map((row) => `| ${row.map((cell) => cell.replace(/\n/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`); rows.splice(1, 0, `| ${table.cells[0].map(() => "---").join(" | ")} |`); if (replace(table.start, table.end, `\n${rows.join("\n")}\n`)) setTable(null); }}>Apply table</Button></div>
    </section>}
    {(images.length > 0 || tables.length > 0) && <div className={styles.blocks} aria-label="Document images and tables">
      {images.map((image, index) => <div className={styles.block} key={`${image.index}-${index}`}><span>Image: {image[1] || `Image ${index + 1}`}</span><Button aria-label={`Remove image ${index + 1}`} disabled={busy} onClick={() => replace(image.index!, image.index! + image[0].length, "")} size="sm" variant="ghost">Remove image</Button></div>)}
      {tables.map((item, index) => <div className={styles.block} key={item.start}><span>Table {index + 1} · {item.cells[0].length} columns</span><div className={styles.tools}><Button aria-label={`Edit table ${index + 1}`} disabled={busy} onClick={() => { setPreview(false); setTable(item); }} size="sm" variant="secondary">Edit table</Button><Button aria-label={`Remove table ${index + 1}`} disabled={busy} onClick={() => replace(item.start, item.end, "")} size="sm" variant="ghost">Remove table</Button></div></div>)}
    </div>}
  </div>;
}

function readCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}
