"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { CanvasItemCard, type CanvasItemCardItem } from "./canvas-item-card";
import styles from "./canvas-items.module.css";

type Kind = "TEXT" | "IMAGE";
type Origin = "ORIGINAL" | "REFERENCE";

export function CanvasItemsPanel({ slug, canvasId, canEdit, canComment: _canComment }: { slug: string; canvasId: string; canEdit: boolean; canComment?: boolean }) {
  const [items, setItems] = useState<CanvasItemCardItem[]>([]);
  const [kind, setKind] = useState<Kind>("TEXT");
  const [origin, setOrigin] = useState<Origin>("ORIGINAL");
  const [replaceItem, setReplaceItem] = useState<CanvasItemCardItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [archiving, setArchiving] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = `/api/projects/${encodeURIComponent(slug)}/canvases/${encodeURIComponent(canvasId)}/items`;

  async function refresh() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("Canvas items could not be loaded. Try again.");
    setItems(await response.json() as CanvasItemCardItem[]);
  }

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Canvas items could not be loaded. Try again.");
      const result = await response.json() as CanvasItemCardItem[];
      if (active) setItems(result);
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Canvas items could not be loaded. Try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const payload = {
      kind,
      origin,
      ...(kind === "TEXT" ? { body: String(data.get("body") ?? "") } : { altText: String(data.get("altText") ?? "") }),
      ...(String(data.get("sourceUrl") ?? "").trim() ? { sourceUrl: String(data.get("sourceUrl")).trim() } : {}),
      ...(String(data.get("rightsNote") ?? "").trim() ? { rightsNote: String(data.get("rightsNote")).trim() } : {}),
    };
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const body = kind === "IMAGE" ? (() => { const multipart = new FormData(); Object.entries(payload).forEach(([key, value]) => multipart.set(key, String(value))); if (file instanceof File) multipart.set("file", file); return multipart; })() : JSON.stringify(payload);
      const response = await fetch(endpoint, { method: "POST", headers: kind === "TEXT" ? { "content-type": "application/json" } : undefined, body });
      if (!response.ok) throw new Error(response.status === 403 ? "Canvas access changed. Refresh and try again." : "Item could not be saved. Check the details and try again.");
      let created: CanvasItemCardItem;
      try {
        created = await response.json() as CanvasItemCardItem;
      } catch {
        form.reset();
        setKind("TEXT");
        setOrigin("ORIGINAL");
        setReplaceItem(null);
        setSubmissionUnknown(true);
        setMessage("The server accepted the item, but its response could not be read. Reload the Canvas before trying again.");
        return;
      }
      setItems((current) => [...current, created]);
      const previousItem = replaceItem;
      form.reset();
      setKind("TEXT");
      setOrigin("ORIGINAL");
      setReplaceItem(null);
      setMessage(previousItem ? "Replacement saved as a new item; archiving the previous item…" : `${created.kind === "IMAGE" ? "Image" : "Note"} added.`);
      let archiveFailed = false;
      if (previousItem) {
        try {
          const archived = await fetch(`${endpoint}/${encodeURIComponent(previousItem.id)}`, { method: "DELETE" });
          if (!archived.ok) throw new Error("Archive request failed");
          const result = await archived.json() as { archivedAt: CanvasItemCardItem["archivedAt"] };
          setItems((current) => current.map((item) => item.id === previousItem.id ? { ...item, archivedAt: result.archivedAt } : item));
        } catch { archiveFailed = true; }
      }
      setMessage(archiveFailed
        ? "Replacement saved, but the previous item could not be archived. Both items remain visible; use Archive on the previous item to retry."
        : previousItem ? "Replacement saved as a new item; the previous item is archived." : `${created.kind === "IMAGE" ? "Image" : "Note"} added.`);
      await refresh().catch(() => setMessage((current) => `${current} The list could not refresh; reload the Canvas to confirm its latest state.`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Item could not be saved. Try again.");
    } finally { setSaving(false); }
  }

  async function archive(itemId: string) {
    if (archiving.includes(itemId)) return;
    setArchiving((current) => [...current, itemId]);
    setError(""); setMessage("");
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Item could not be archived. Refresh and try again.");
      const result = await response.json() as { archivedAt: CanvasItemCardItem["archivedAt"] };
      setItems((current) => current.map((item) => item.id === itemId ? { ...item, archivedAt: result.archivedAt } : item));
      await refresh(); setMessage("Item archived; its history and attribution remain.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Item could not be archived."); }
    finally { setArchiving((current) => current.filter((id) => id !== itemId)); }
  }

  function startReplacement(item: CanvasItemCardItem) {
    setReplaceItem(item); setKind(item.kind); setOrigin(item.origin); setError(""); setMessage("");
    requestAnimationFrame(() => document.getElementById("canvas-item-kind")?.focus());
  }

  return <section aria-labelledby="canvas-items-heading" className={styles.panel}>
    <h2 id="canvas-items-heading">Canvas items</h2>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {loading ? <p role="status">Loading Canvas items…</p> : items.length ? <div className={styles.list}>{items.map((item) => <CanvasItemCard busy={archiving.includes(item.id)} item={item} key={item.id} onArchive={canEdit ? archive : undefined} onReplace={canEdit ? startReplacement : undefined} readOnly={!canEdit} />)}</div> : <p>No Canvas items yet.</p>}
    {canEdit && <form className={styles.composer} onSubmit={submit}>
      <fieldset disabled={saving || submissionUnknown}>
      <h3>{replaceItem ? "Replace item" : "Add to this Canvas"}</h3>
      {replaceItem && <p>Saving creates a new item ID. The previous item will be archived after the replacement is saved.</p>}
      <Field id="canvas-item-kind" label="Item type"><Select onChange={(event) => setKind(event.currentTarget.value as Kind)} value={kind}><option value="TEXT">Text note</option><option value="IMAGE">Image</option></Select></Field>
      <Field id="canvas-item-origin" label="Contribution type"><Select onChange={(event) => setOrigin(event.currentTarget.value as Origin)} value={origin}><option value="ORIGINAL">My original work</option><option value="REFERENCE">Reference material</option></Select></Field>
      {kind === "TEXT" ? <Field id="canvas-item-body" label="Note" required><Textarea maxLength={2000} name="body" required rows={4} /></Field> : <>
        <Field description="PNG or JPEG, up to 10 MB." id="canvas-item-file" label="Image file" required><Input accept="image/png,image/jpeg" name="file" required type="file" /></Field>
        <Field id="canvas-item-alt" label="Alternative text" required><Input maxLength={500} name="altText" required /></Field>
      </>}
      <Field description="Use a direct HTTP or HTTPS link to the original source." id="canvas-item-source" label="Source URL (optional)"><Input autoComplete="url" maxLength={2048} name="sourceUrl" type="url" /></Field>
      <Field id="canvas-item-rights" label="Rights note (optional)"><Textarea maxLength={2000} name="rightsNote" rows={2} /></Field>
      <p className={styles.rightsHelp}>Source and rights notes record attribution only; they do not grant permission to use an image. Canvas items do not inherit the project license.</p>
      <div className={styles.actions}><Button disabled={saving} loading={saving} loadingLabel="Saving Canvas item" type="submit">{replaceItem ? "Save replacement" : "Add item"}</Button>{replaceItem && <Button disabled={saving} onClick={() => { setReplaceItem(null); setKind("TEXT"); setOrigin("ORIGINAL"); }} type="button" variant="secondary">Cancel replacement</Button>}</div>
      </fieldset>
    </form>}
  </section>;
}
