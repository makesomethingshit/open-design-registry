"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent } from "react";
import { canvasExtent, moveCanvasRectByKeyboard } from "@/src/lib/canvas/spatial";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import styles from "./canvas-board.module.css";

export type CanvasItem = {
  id: string;
  kind: "IMAGE" | "TEXT";
  origin: "ORIGINAL" | "REFERENCE";
  body: string | null;
  assetKey: string | null;
  altText: string | null;
  sourceUrl: string | null;
  rightsNote: string | null;
  author: { name: string } | null;
  createdAt: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  archivedAt: string | null;
};

type CanvasComment = { id: string; itemId: string; body: string; createdAt: string; author: { name: string } | null };
type GeometryKey = "x" | "y" | "width" | "height";
type GeometryDraft = Record<GeometryKey, string>;
const geometryKeys: readonly GeometryKey[] = ["x", "y", "width", "height"];
const geometryValue = (key: GeometryKey, raw: string, fallback: number) => {
  if (!raw.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const [min, max] = key === "width" || key === "height" ? [64, 8192] : [-1_000_000, 1_000_000];
  return clamp(value, min, max);
};
const geometryDraft = (item: CanvasItem): GeometryDraft => ({ x: String(item.x), y: String(item.y), width: String(item.width), height: String(item.height) });
type View = { x: number; y: number; zoom: number };
type Interaction =
  | { kind: "pan"; pointerId: number; clientX: number; clientY: number; view: View }
  | { kind: "move" | "resize"; pointerId: number; itemId: string; clientX: number; clientY: number; rect: Pick<CanvasItem, "x" | "y" | "width" | "height">; latest?: Pick<CanvasItem, "x" | "y" | "width" | "height"> };
export type CanvasItemCardProps = { item: CanvasItem; readOnly: boolean; selected: boolean; onArchive: () => void };
type Props = {
  slug: string;
  canvasId: string;
  canEdit: boolean;
  canComment: boolean;
  readOnlyLabel?: string;
  renderItem?: (props: CanvasItemCardProps) => ReactNode;
  onArchive?: () => void;
  refreshRevision?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const itemUrl = (slug: string, canvasId: string) => `/api/projects/${encodeURIComponent(slug)}/canvases/${encodeURIComponent(canvasId)}/items`;
const feedbackUrl = (slug: string, canvasId: string) => `/api/projects/${encodeURIComponent(slug)}/canvases/${encodeURIComponent(canvasId)}/comments`;
const layoutUrl = (slug: string, canvasId: string) => `/api/projects/${encodeURIComponent(slug)}/canvases/${encodeURIComponent(canvasId)}/layout`;

export function CanvasBoard({ slug, canvasId, canEdit, canComment, readOnlyLabel, renderItem, onArchive, refreshRevision = 0 }: Props) {
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [comments, setComments] = useState<CanvasComment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const [showArchived, setShowArchived] = useState(false);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const [view, setView] = useState<View>({ x: 24, y: 24, zoom: 1 });
  const [numberDrafts, setNumberDrafts] = useState<GeometryDraft>({ x: "0", y: "0", width: "320", height: "240" });
  const numberDraftsRef = useRef(numberDrafts);
  const [draft, setDraft] = useState("");
  const [commentSubmissionUnknown, setCommentSubmissionUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const interaction = useRef<Interaction | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  const reloadGeneration = useRef(0);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const generation = ++reloadGeneration.current;
    const canvasResponse = await fetch(`/api/projects/${encodeURIComponent(slug)}/canvases/${encodeURIComponent(canvasId)}`);
    if (!canvasResponse.ok) throw new Error("This Canvas is unavailable.");
    const canvas = await canvasResponse.json() as { layoutVersion: number };
    const itemsResponse = await fetch(itemUrl(slug, canvasId));
    if (!itemsResponse.ok) throw new Error("This Canvas is unavailable.");
    const nextItems = await itemsResponse.json() as CanvasItem[];
    if (generation !== reloadGeneration.current) return;
    setVersion(canvas.layoutVersion);
    versionRef.current = canvas.layoutVersion;
    setItems(nextItems);
  }, [slug, canvasId]);

  useEffect(() => { void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load this Canvas.")); }, [reload]);

  const refreshedRevision = useRef(0);
  useEffect(() => {
    if (busy || refreshedRevision.current === refreshRevision) return;
    refreshedRevision.current = refreshRevision;
    void reload().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh this Canvas."));
  }, [refreshRevision, busy, reload]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) return;
    const next = geometryDraft(selected);
    numberDraftsRef.current = next;
    setNumberDrafts(next);
  }, [selected?.id, selected?.x, selected?.y, selected?.width, selected?.height]);
  useEffect(() => {
    setComments([]);
    setCommentCursor(null);
    setDraft("");
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`${feedbackUrl(slug, canvasId)}?itemId=${encodeURIComponent(selected.id)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load feedback for this item.");
        const result = await response.json() as CanvasComment[];
        if (!controller.signal.aborted && selectedIdRef.current === selected.id) {
          setComments(result);
          setCommentCursor(response.headers.get("x-next-cursor"));
        }
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted && selectedIdRef.current === selected.id) setError(cause instanceof Error ? cause.message : "Could not load feedback."); });
    return () => controller.abort();
  }, [slug, canvasId, selected?.id]);

  const loadMoreComments = async () => {
    if (!selected || !commentCursor || busyRef.current) return;
    const itemId = selected.id;
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch(`${feedbackUrl(slug, canvasId)}?itemId=${encodeURIComponent(itemId)}&cursor=${encodeURIComponent(commentCursor)}`);
      if (!response.ok) throw new Error("Could not load more feedback.");
      const result = await response.json() as CanvasComment[];
      if (selectedIdRef.current === itemId) {
        setComments((current) => [...current, ...result.filter((entry) => !current.some((existing) => existing.id === entry.id))]);
        setCommentCursor(response.headers.get("x-next-cursor"));
      }
    } catch (cause) { if (selectedIdRef.current === itemId) setError(cause instanceof Error ? cause.message : "Could not load more feedback."); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const saveRect = useCallback(async (itemId: string, rect: Pick<CanvasItem, "x" | "y" | "width" | "height" | "zIndex">) => {
    if (!canEdit || busyRef.current) return false;
    busyRef.current = true;
    ++reloadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(layoutUrl(slug, canvasId), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, expectedCanvasVersion: versionRef.current, rect }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "The board changed elsewhere. Reloaded the latest layout." : "Could not save this layout.");
      const result = await response.json() as { layoutVersion: number };
      versionRef.current = result.layoutVersion;
      setVersion(result.layoutVersion);
      return true;
    } catch (cause) {
      await reload().catch(() => {});
      setError(cause instanceof Error ? cause.message : "Could not save this layout.");
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  }, [slug, canvasId, reload, canEdit]);

  const begin = (event: ReactPointerEvent<HTMLElement>, next: Interaction) => {
    if (interaction.current || busyRef.current || (next.kind !== "pan" && !canEdit)) return;
    if (next.kind !== "pan") setSelectedId(next.itemId);
    event.preventDefault();
    event.stopPropagation();
    ++reloadGeneration.current;
    interaction.current = next;
    viewport.current?.setPointerCapture(event.pointerId);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (active.kind === "pan") {
        setView({ ...active.view, x: active.view.x + event.clientX - active.clientX, y: active.view.y + event.clientY - active.clientY });
        return;
      }
      const dx = (event.clientX - active.clientX) / view.zoom;
      const dy = (event.clientY - active.clientY) / view.zoom;
      active.latest = active.kind === "move"
        ? { ...active.rect, x: clamp(active.rect.x + dx, -1_000_000, 1_000_000), y: clamp(active.rect.y + dy, -1_000_000, 1_000_000) }
        : { ...active.rect, width: clamp(active.rect.width + dx, 64, 8192), height: clamp(active.rect.height + dy, 64, 8192) };
      const latest = active.latest;
      setItems((current) => current.map((item) => item.id === active.itemId ? { ...item, ...latest } : item));
    };
    const up = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active || active.pointerId !== event.pointerId) return;
      interaction.current = null;
      if (active.kind === "pan") return;
      if (!active.latest || geometryKeys.every((key) => active.latest![key] === active.rect[key])) return;
      const item = items.find((candidate) => candidate.id === active.itemId);
      if (item) {
        const rect = active.latest ?? active.rect;
        void saveRect(item.id, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, zIndex: item.zIndex });
      }
    };
    const cancel = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active || active.pointerId !== event.pointerId) return;
      interaction.current = null;
      if (active.kind !== "pan") void reload();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); };
  }, [items, saveRect, reload, view.zoom]);

  const updateNumberDraft = (key: GeometryKey, value: string) => {
    const next = { ...numberDraftsRef.current, [key]: value };
    numberDraftsRef.current = next;
    setNumberDrafts(next);
  };

  const normalizeNumberDraft = (key: GeometryKey) => {
    if (!selected) return;
    const next = { ...numberDraftsRef.current, [key]: String(geometryValue(key, numberDraftsRef.current[key], selected[key])) };
    numberDraftsRef.current = next;
    setNumberDrafts(next);
  };

  const saveNumbers = () => {
    if (!canEdit || busyRef.current || !selected) return;
    const rect = Object.fromEntries(geometryKeys.map((key) => [key, geometryValue(key, numberDraftsRef.current[key], selected[key])])) as Pick<CanvasItem, GeometryKey>;
    const nextDrafts = Object.fromEntries(geometryKeys.map((key) => [key, String(rect[key])])) as GeometryDraft;
    numberDraftsRef.current = nextDrafts;
    setNumberDrafts(nextDrafts);
    if (geometryKeys.every((key) => rect[key] === selected[key])) return;
    setItems((current) => current.map((item) => item.id === selected.id ? { ...item, ...rect } : item));
    void saveRect(selected.id, { ...rect, zIndex: selected.zIndex });
  };

  const changeZ = async (action: "front" | "back") => {
    if (!selected || !canEdit || busyRef.current || selected.archivedAt) return;
    busyRef.current = true;
    ++reloadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(layoutUrl(slug, canvasId), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: selected.id, expectedCanvasVersion: versionRef.current, action }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "The board changed elsewhere. Reloaded the latest layout." : "Could not save this layer order.");
      const result = await response.json() as { items: CanvasItem[]; layoutVersion: number };
      if (!Array.isArray(result.items)) throw new Error("The server returned an incomplete layer order.");
      const latest = new Map(result.items.map((item) => [item.id, item]));
      setItems((current) => current.map((item) => {
        const updated = latest.get(item.id);
        return updated ? { ...item, ...updated, author: updated.author ?? item.author } : item;
      }));
      versionRef.current = result.layoutVersion;
      setVersion(result.layoutVersion);
    } catch (cause) {
      await reload().catch(() => {});
      setError(cause instanceof Error ? cause.message : "Could not save this layer order.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const archiveItem = async (itemId: string) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    ++reloadGeneration.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${itemUrl(slug, canvasId)}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not archive this item.");
      const archived = await response.json() as CanvasItem;
      setItems((current) => current.map((item) => item.id === archived.id ? { ...item, ...archived, author: archived.author ?? item.author } : item));
      setShowArchived(true);
      onArchive?.();
    } catch (cause) {
      await reload().catch(() => {});
      setShowArchived(true);
      onArchive?.();
      setError(cause instanceof Error ? cause.message : "Could not archive this item.");
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  const fit = () => {
    const visible = items.filter((item) => showArchived || !item.archivedAt);
    const box = viewport.current?.getBoundingClientRect();
    const extent = canvasExtent(visible);
    if (!extent || !box) { setView({ x: 24, y: 24, zoom: 1 }); return; }
    const { left, top, right, bottom } = extent;
    const zoom = clamp(Math.min((box.width - 48) / (right - left), (box.height - 48) / (bottom - top)), 0.2, 1.5);
    setView({ x: (box.width - (right - left) * zoom) / 2 - left * zoom, y: (box.height - (bottom - top) * zoom) / 2 - top * zoom, zoom });
  };

  const zoomAtCenter = (factor: number) => {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    const zoom = clamp(view.zoom * factor, 0.2, 2);
    const cx = box.width / 2, cy = box.height / 2;
    setView({ zoom, x: cx - (cx - view.x) * zoom / view.zoom, y: cy - (cy - view.y) * zoom / view.zoom });
  };

  const wheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("[data-item-id]")) return;
    event.preventDefault();
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    const zoom = clamp(view.zoom * (event.deltaY < 0 ? 1.1 : 0.9), 0.2, 2);
    const x = event.clientX - box.left, y = event.clientY - box.top;
    setView({ zoom, x: x - (x - view.x) * zoom / view.zoom, y: y - (y - view.y) * zoom / view.zoom });
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !draft.trim() || commentSubmissionUnknown) return;
    const itemId = selected.id;
    const submittedDraft = draft;
    if (busyRef.current) return;
    busyRef.current = true;
    ++reloadGeneration.current;
    setBusy(true); setError("");
    try {
      let response: Response;
      try {
        response = await fetch(feedbackUrl(slug, canvasId), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, body: submittedDraft }) });
      } catch {
        setCommentSubmissionUnknown(true);
        setError("We could not confirm whether feedback was saved. Reload this Canvas before trying again.");
        return;
      }
      if (!response.ok) {
        if (response.status >= 500) {
          setCommentSubmissionUnknown(true);
          setError("We could not confirm whether feedback was saved. Reload this Canvas before trying again.");
          return;
        }
        throw new Error("This item no longer accepts feedback.");
      }
      let commentPayload: unknown;
      try { commentPayload = await response.json(); }
      catch {
        setCommentSubmissionUnknown(true);
        setError("We could not confirm whether feedback was saved. Reload this Canvas before trying again.");
        return;
      }
      if (!commentPayload || typeof commentPayload !== "object"
        || !("id" in commentPayload) || typeof commentPayload.id !== "string"
        || !("itemId" in commentPayload) || commentPayload.itemId !== itemId) {
        setCommentSubmissionUnknown(true);
        setError("We could not confirm whether feedback was saved. Reload this Canvas before trying again.");
        return;
      }
      const comment = commentPayload as CanvasComment;
      if (selectedIdRef.current === itemId) {
        setComments((current) => current.some((entry) => entry.id === comment.id) ? current : [...current, comment]);
        setDraft((current) => current === submittedDraft ? "" : current);
      }
    } catch (cause) {
      if (selectedIdRef.current === itemId) setError(cause instanceof Error ? cause.message : "Could not post feedback.");
    }
    finally { busyRef.current = false; setBusy(false); }
  };

  const renderDefault = ({ item, readOnly }: CanvasItemCardProps) => <div className={styles.cardBody}>
    <p className={styles.cardKind}>{item.kind === "IMAGE" ? "Image" : "Note"} · {item.origin === "REFERENCE" ? "Reference" : "Original"}</p>
    {item.kind === "IMAGE" && item.assetKey && <img className={styles.itemImage} src={`/api/assets?key=${encodeURIComponent(item.assetKey)}`} alt={item.altText ?? ""} />}
    {item.body && <p className={styles.itemBody}>{item.body}</p>}
    {item.altText && <p className={styles.itemBody}>{item.altText}</p>}
    {item.sourceUrl && <a href={item.sourceUrl} rel="noreferrer" target="_blank">Source</a>}
    {item.rightsNote && <p className={styles.rightsNote}>{item.rightsNote}</p>}
    {readOnly && <p className={styles.readOnly}>Read-only history</p>}
  </div>;

  return <section className={styles.boardSection} aria-label="Canvas board">
    <div className={styles.toolbar} aria-label="Canvas controls">
      <div className={styles.zoomControls}>
        <Button variant="secondary" onClick={() => zoomAtCenter(1.2)} aria-label="Zoom in">+</Button>
        <output aria-label="Zoom level">{Math.round(view.zoom * 100)}%</output>
        <Button variant="secondary" onClick={() => zoomAtCenter(1 / 1.2)} aria-label="Zoom out">−</Button>
        <Button variant="secondary" onClick={fit}>Fit</Button>
        <Button variant="secondary" onClick={() => setView({ x: 24, y: 24, zoom: 1 })}>Reset</Button>
      </div>
      <span className={styles.boardState}>{canEdit ? "You can arrange this board" : readOnlyLabel ?? "Read-only Canvas"}</span>
    </div>

    {error && <p role="alert" className={styles.error}>{error}</p>}
    {commentSubmissionUnknown && <p role="status" className={styles.readOnly}>
      We could not confirm whether feedback was saved. Reload this Canvas before trying again. <Button variant="secondary" onClick={() => window.location.reload()}>Reload Canvas</Button>
    </p>}
    <div className={styles.boardTools}>
      <Field id="canvas-item-select" label="Select an item">
        <Select value={selectedId ?? ""} onChange={(event) => {
          const next = items.find((item) => item.id === event.target.value);
          setSelectedId(next?.id ?? null);
          if (next?.archivedAt) setShowArchived(true);
        }}>
          <option value="">Choose an item</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.archivedAt ? "Archived · " : ""}{item.body ?? item.altText ?? item.id}</option>)}
        </Select>
      </Field>
      <Button variant="secondary" aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Hide archived items" : "Show archived items"}</Button>
    </div>
    <div className={styles.workspace}>
      <div ref={viewport} className={styles.viewport} data-testid="canvas-viewport" onPointerDown={(event) => {
        if (event.target === event.currentTarget) begin(event, { kind: "pan", pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, view });
      }} onWheel={wheelZoom} onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key.startsWith("Arrow")) {
          event.preventDefault();
          setView((current) => ({ ...current, x: current.x + (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0), y: current.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0) }));
        } else if (event.key === "+" || event.key === "=") zoomAtCenter(1.2);
        else if (event.key === "-") zoomAtCenter(1 / 1.2);
        else if (event.key === "Home") fit();
        else if (event.key === "0") setView({ x: 24, y: 24, zoom: 1 });
      }} tabIndex={0} role="region" aria-label="Spatial Canvas. Use arrow keys to pan, plus and minus to zoom, and Home to fit.">
        <div className={styles.world} data-testid="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          {items.filter((item) => showArchived || !item.archivedAt).map((item) => {
            const selectedItem = item.id === selectedId;
            const style = { left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.zIndex } as CSSProperties;
            const cardProps = { item, readOnly: !canEdit || Boolean(item.archivedAt), selected: selectedItem, onArchive: () => void archiveItem(item.id) };
            return <article key={item.id} className={`${styles.item}${selectedItem ? ` ${styles.selected}` : ""}`} data-item-id={item.id} style={style} tabIndex={0} aria-label={`${item.kind === "IMAGE" ? "Image" : "Note"}: ${item.body ?? item.altText ?? item.id}`} onFocus={() => setSelectedId(item.id)} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); }
              if (canEdit && !busyRef.current && !item.archivedAt && event.altKey && event.key.startsWith("Arrow")) {
                event.preventDefault();
                const next = moveCanvasRectByKeyboard(item, event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown");
                setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, ...next } : currentItem));
                void saveRect(item.id, { x: next.x, y: next.y, width: next.width, height: next.height, zIndex: next.zIndex });
              }
            }}>
              {canEdit && !item.archivedAt && <Button variant="ghost" className={styles.dragHandle} type="button" data-drag-handle onPointerDown={(event) => begin(event, { kind: "move", pointerId: event.pointerId, itemId: item.id, clientX: event.clientX, clientY: event.clientY, rect: item })} onClick={() => setSelectedId(item.id)} aria-label={`Move ${item.kind === "IMAGE" ? "image" : "note"}`}>Move · {item.author?.name ?? "Designer"}</Button>}
              {renderItem ? renderItem(cardProps) : renderDefault(cardProps)}
              {canEdit && !item.archivedAt && <Button variant="ghost" className={styles.resizeHandle} type="button" data-resize-handle onPointerDown={(event) => begin(event, { kind: "resize", pointerId: event.pointerId, itemId: item.id, clientX: event.clientX, clientY: event.clientY, rect: item })} aria-label="Resize item" />}
            </article>;
          })}
        </div>
      </div>

      <aside className={styles.feedback} aria-labelledby="feedback-title">
        <div className={styles.feedbackHeader}><h2 id="feedback-title">Feedback</h2>{selected && <span>Item {selected.id.slice(-6)}</span>}</div>
        {!selected ? <p className={styles.empty}>Select an item to read its feedback.</p> : <>
          <h3>{selected.body ?? selected.altText ?? "Canvas item"}</h3>
          {selected.archivedAt && <p className={styles.readOnly}>Archived item · comments stay with this item</p>}
          <ol className={styles.comments} aria-label={`Feedback for item ${selected.id}`}>
            {comments.map((comment) => <li key={comment.id}><strong>{comment.author?.name ?? "Designer"}</strong><p>{comment.body}</p><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time></li>)}
          </ol>
          {commentCursor && <Button variant="secondary" disabled={busy} onClick={() => void loadMoreComments()}>Load more feedback</Button>}
          {canComment && !selected.archivedAt ? <form className={styles.commentForm} onSubmit={submitComment}>
            <Field id="canvas-feedback" label="Add feedback" required>
              <Textarea maxLength={10000} required value={draft} onChange={(event) => setDraft(event.target.value)} />
            </Field>
            <Button type="submit" disabled={busy || commentSubmissionUnknown || !draft.trim()}>Post feedback</Button>
          </form> : <p className={styles.readOnly}>{selected.archivedAt ? "Archived items do not accept new feedback." : "This Canvas is read-only."}</p>}
        </>}
      </aside>
    </div>

    {selected && <section className={styles.layoutPanel} aria-label="Selected item layout">
      <h2>Selected item layout</h2>
      <div className={styles.numericFields}>
        {(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key === "x" ? "X position" : key === "y" ? "Y position" : key === "width" ? "Width" : "Height"}
          <Input type="text" inputMode="decimal" disabled={!canEdit || busy || Boolean(selected.archivedAt)} value={numberDrafts[key]} onChange={(event) => updateNumberDraft(key, event.target.value)} onBlur={() => normalizeNumberDraft(key)} />
        </label>)}
        <Button variant="secondary" disabled={!canEdit || busy || Boolean(selected.archivedAt)} onClick={saveNumbers}>Save layout</Button>
        <Button variant="secondary" disabled={!canEdit || busy || Boolean(selected.archivedAt)} onClick={() => void changeZ("front")}>Bring to front</Button>
        <Button variant="secondary" disabled={!canEdit || busy || Boolean(selected.archivedAt)} onClick={() => void changeZ("back")}>Send to back</Button>
        {canEdit && <Button variant="secondary" disabled={busy || Boolean(selected.archivedAt)} onClick={() => void archiveItem(selected.id)}>Archive selected item</Button>}
      </div>
      <p className={styles.version}>Layout version {version}. Arrow keys with Alt move the focused item by 10 units.</p>
    </section>}
  </section>;
}
