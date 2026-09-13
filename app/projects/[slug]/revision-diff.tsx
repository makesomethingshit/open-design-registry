"use client";

import { useState } from "react";

type Preview = { key?: string; url: string; position: number; altText: string; mimeType?: string };
type ComparisonMode = "auto" | "side-by-side";

function PreviewDiff({ current, previous, currentNumber, previousNumber, currentLabel = "Revision", previousLabel = "Revision", comparisonMode = "auto" }: { current?: Preview; previous?: Preview; currentNumber: number; previousNumber?: number; currentLabel?: string; previousLabel?: string; comparisonMode?: ComparisonMode }) {
  const [currentSize, setCurrentSize] = useState<[number, number]>();
  const [previousSize, setPreviousSize] = useState<[number, number]>();
  const [opacity, setOpacity] = useState(50);
  const [mode, setMode] = useState<ComparisonMode>(comparisonMode);
  const sameSize = Boolean(currentSize && previousSize && currentSize[0] === previousSize[0] && currentSize[1] === previousSize[1]);
  const imagePair = current?.mimeType !== "text/html" && previous?.mimeType !== "text/html" && [current?.mimeType, previous?.mimeType].every((type) => !type || type === "image/png" || type === "image/jpeg");
  const showOverlay = imagePair && sameSize && mode !== "side-by-side";
  const preview = current ?? previous;
  if (!preview) return null;
  const label = `Preview ${preview.position + 1}`;
  const alt = preview.altText || `Preview of ${label}, Revision ${currentNumber}; description unavailable`;
  if (!current || !previous) return <figure className="preview-diff"><figcaption>{label} · {current ? `Only in proposal Revision ${currentNumber}` : `Only in original Revision ${previousNumber}`}</figcaption><img src={preview.url} alt={alt} onError={() => { setCurrentSize(undefined); setPreviousSize(undefined); }} /></figure>;
  return <figure className="preview-diff">
    <figcaption>{label} · Revision {previousNumber} → {currentNumber}</figcaption>
    {showOverlay ? <div className="diff-stage" style={{ aspectRatio: `${currentSize![0]} / ${currentSize![1]}` }}>
      <img src={previous.url} alt={previous.altText || `Preview of ${label}, Revision ${previousNumber}; description unavailable`} onLoad={(event) => setPreviousSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} onError={() => setPreviousSize(undefined)} />
      <img src={current.url} alt={current.altText || `Preview of ${label}, Revision ${currentNumber}; description unavailable`} style={{ opacity: opacity / 100 }} onLoad={(event) => setCurrentSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} onError={() => setCurrentSize(undefined)} />
    </div> : <div className="diff-side-by-side">
      <div><span>{previousLabel} {previousNumber}</span><img src={previous.url} alt={previous.altText || `Preview of ${label}, Revision ${previousNumber}; description unavailable`} onLoad={(event) => setPreviousSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} onError={() => setPreviousSize(undefined)} /></div>
      <div><span>{currentLabel} {currentNumber}</span><img src={current.url} alt={current.altText || `Preview of ${label}, Revision ${currentNumber}; description unavailable`} onLoad={(event) => setCurrentSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} onError={() => setCurrentSize(undefined)} /></div>
    </div>}
    {comparisonMode === "side-by-side" && <div className="comparison-controls"><button type="button" className="button secondary" aria-pressed={mode === "side-by-side"} onClick={() => setMode("side-by-side")}>Side by side</button><button type="button" className="button secondary" aria-pressed={showOverlay} disabled={!imagePair || !sameSize} onClick={() => setMode("auto")}>Overlay</button>{(!imagePair || !sameSize) && <span className="meta">Overlay requires matching PNG or JPG dimensions.</span>}</div>}
    {showOverlay && <label className="opacity-control">{currentLabel} opacity <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} aria-label={`${currentLabel} ${label} opacity`} aria-valuetext={`${opacity}%`} /></label>}
  </figure>;
}

export default function RevisionDiff({ current, previous, currentNumber, previousNumber, currentLabel, previousLabel, comparisonMode }: { current: Preview[]; previous?: Preview[]; currentNumber: number; previousNumber?: number; currentLabel?: string; previousLabel?: string; comparisonMode?: ComparisonMode }) {
  const positions = [...new Set([...(current ?? []).map((preview) => preview.position), ...(previous ?? []).map((preview) => preview.position)])].sort((a, b) => a - b);
  return <div className="revision-diffs" aria-label={`Visual comparison for ${currentLabel ?? "Revision"} ${currentNumber}`}>
    {positions.map((position) => { const currentPreview = current.find((preview) => preview.position === position); const previousPreview = previous?.find((preview) => preview.position === position); return <PreviewDiff key={`${position}-${currentPreview?.url ?? "none"}-${previousPreview?.url ?? "none"}`} current={currentPreview} previous={previousPreview} currentNumber={currentNumber} previousNumber={previousNumber} currentLabel={currentLabel} previousLabel={previousLabel} comparisonMode={comparisonMode} />; })}
  </div>;
}
