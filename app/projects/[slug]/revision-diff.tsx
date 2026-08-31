"use client";

import { useState } from "react";

type Preview = { key: string; url: string; position: number; altText: string };

function PreviewDiff({ current, previous, currentNumber, previousNumber }: { current?: Preview; previous?: Preview; currentNumber: number; previousNumber?: number }) {
  const [currentSize, setCurrentSize] = useState<[number, number]>();
  const [previousSize, setPreviousSize] = useState<[number, number]>();
  const [opacity, setOpacity] = useState(50);
  const sameSize = Boolean(currentSize && previousSize && currentSize[0] === previousSize[0] && currentSize[1] === previousSize[1]);
  const preview = current ?? previous;
  if (!preview) return null;
  const label = `Preview ${preview.position + 1}`;
  if (!current || !previous) return <figure className="preview-diff"><figcaption>{label} · {current ? `Added in Revision ${currentNumber}` : `Removed after Revision ${previousNumber}`}</figcaption><img src={preview.url} alt={preview.altText} /></figure>;
  return <figure className="preview-diff">
    <figcaption>{label} · Revision {previousNumber} → {currentNumber}</figcaption>
    {sameSize ? <div className="diff-stage" style={{ aspectRatio: `${currentSize![0]} / ${currentSize![1]}` }}>
      <img src={previous.url} alt={previous.altText} onLoad={(event) => setPreviousSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} />
      <img src={current.url} alt={current.altText} style={{ opacity: opacity / 100 }} onLoad={(event) => setCurrentSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} />
    </div> : <div className="diff-side-by-side">
      <div><span>Revision {previousNumber}</span><img src={previous.url} alt={previous.altText} onLoad={(event) => setPreviousSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} /></div>
      <div><span>Revision {currentNumber}</span><img src={current.url} alt={current.altText} onLoad={(event) => setCurrentSize([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} /></div>
    </div>}
    {sameSize && <label className="opacity-control">Current revision opacity <input type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} aria-label={`Current ${label} opacity`} aria-valuetext={`${opacity}%`} /></label>}
  </figure>;
}

export default function RevisionDiff({ current, previous, currentNumber, previousNumber }: { current: Preview[]; previous?: Preview[]; currentNumber: number; previousNumber?: number }) {
  const positions = [...new Set([...(current ?? []).map((preview) => preview.position), ...(previous ?? []).map((preview) => preview.position)])].sort((a, b) => a - b);
  return <div className="revision-diffs" aria-label={`Visual comparison for Revision ${currentNumber}`}>
    {positions.map((position) => <PreviewDiff key={position} current={current.find((preview) => preview.position === position)} previous={previous?.find((preview) => preview.position === position)} currentNumber={currentNumber} previousNumber={previousNumber} />)}
  </div>;
}
