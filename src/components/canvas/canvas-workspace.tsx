"use client";

import { useState } from "react";
import { CanvasBoard } from "./canvas-board";
import { CanvasItemCard } from "./canvas-item-card";
import { CanvasItemsPanel } from "./canvas-items-panel";

export function CanvasWorkspace({ slug, canvasId, canEdit, canComment }: { slug: string; canvasId: string; canEdit: boolean; canComment: boolean }) {
  const [revision, setRevision] = useState(0);
  const [itemRevision, setItemRevision] = useState(0);
  return <div style={{ display: "grid", gap: "var(--odr-space-5)", minWidth: 0 }}>
    <CanvasBoard canvasId={canvasId} canComment={canComment} canEdit={canEdit} refreshRevision={revision} onArchive={() => setItemRevision((current) => current + 1)} renderItem={({ item, readOnly, selected }) => <CanvasItemCard item={item} readOnly={readOnly} selected={selected} />} slug={slug} />
    <CanvasItemsPanel refreshRevision={itemRevision} canvasId={canvasId} canEdit={canEdit} onChange={() => setRevision((current) => current + 1)} slug={slug} />
  </div>;
}
