"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import styles from "./canvas-items.module.css";

export type CanvasItemCardItem = {
  id: string;
  kind: "IMAGE" | "TEXT";
  origin: "ORIGINAL" | "REFERENCE";
  body: string | null;
  assetKey: string | null;
  altText: string | null;
  sourceUrl: string | null;
  rightsNote: string | null;
  archivedAt: Date | string | null;
  createdAt: Date | string;
  author: { name: string } | null;
};

export function CanvasItemCard({ item, selected = false, readOnly = false, busy = false, onArchive, onReplace }: {
  item: CanvasItemCardItem;
  selected?: boolean;
  readOnly?: boolean;
  busy?: boolean;
  onArchive?: (itemId: string) => void;
  onReplace?: (item: CanvasItemCardItem) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  return <article aria-label={`${item.kind === "IMAGE" ? "Image" : "Note"}${item.archivedAt ? ", archived" : ""}`} className={styles.card} data-archived={Boolean(item.archivedAt)} data-selected={selected || undefined}>
    {item.assetKey && (imageFailed
      ? <div className={styles.imageFallback} role="status"><span>Image unavailable: {item.altText}</span><Button onClick={() => { setImageFailed(false); setImageAttempt((attempt) => attempt + 1); }} type="button" variant="secondary">Retry image</Button></div>
      : <img alt={item.altText ?? ""} className={styles.image} key={imageAttempt} loading="lazy" onError={() => setImageFailed(true)} src={`/api/assets?key=${encodeURIComponent(item.assetKey)}`} />)}
    {item.body && <p className={styles.body}>{item.body}</p>}
    <dl className={styles.provenance}>
      <div><dt>Type</dt><dd>{item.origin === "ORIGINAL" ? "Original work" : "Reference"}</dd></div>
      <div><dt>Added by</dt><dd>{item.author?.name ?? "Former contributor"}</dd></div>
      {item.sourceUrl && <div><dt>Source</dt><dd><a href={item.sourceUrl} rel="noreferrer noopener" target="_blank">{item.sourceUrl}</a></dd></div>}
      {item.rightsNote && <div><dt>Rights note</dt><dd>{item.rightsNote}</dd></div>}
    </dl>
    {item.archivedAt && <p className={styles.archived}>Archived. This item and its attribution remain in the Canvas history.</p>}
    {!readOnly && !item.archivedAt && (onArchive || onReplace) && <div className={styles.cardActions}>
      {onReplace && <Button disabled={busy} onClick={() => onReplace(item)} type="button" variant="secondary">Replace with a new item</Button>}
      {onArchive && <Button disabled={busy} loading={busy} loadingLabel="Archiving Canvas item" onClick={() => onArchive(item.id)} type="button" variant="secondary">Archive</Button>}
    </div>}
  </article>;
}
