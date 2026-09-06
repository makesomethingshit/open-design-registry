"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/src/components/ui/icon";
import { IconButton } from "@/src/components/ui/button";
import { SegmentedControl } from "@/src/components/ui/segmented-control";
import type { DesignPreviewAsset } from "./review-types";
import styles from "./design-preview.module.css";

type CanvasBackground = "white" | "gray" | "black" | "checker";
type ComparisonMode = "side-by-side" | "overlay";
type ImageSize = readonly [number, number];

type DesignPreviewProps = {
  current: DesignPreviewAsset[];
  previous: DesignPreviewAsset[];
  currentLabel: string;
  previousLabel: string;
  currentNumber: number;
  previousNumber?: number;
  missingPreviousLabel?: string;
  missingCurrentLabel?: string;
  rename?: { previousName: string; currentName: string };
};

function isRaster(asset: DesignPreviewAsset | undefined) {
  return asset?.mimeType === "image/png" || asset?.mimeType === "image/jpeg";
}

function sameSize(current: ImageSize | undefined, previous: ImageSize | undefined) {
  return Boolean(current && previous && current[0] === previous[0] && current[1] === previous[1]);
}

export function previewAssetKey(side: "current" | "previous", asset: DesignPreviewAsset) {
  return `${side}:${asset.id}:${asset.url}`;
}

function canvasStyle(zoom: number) {
  return { "--odr-preview-zoom": `${zoom}%` } as CSSProperties;
}

export function DesignPreview({ current, currentLabel, currentNumber, missingCurrentLabel = "Removed", missingPreviousLabel = "Not present", previous, previousLabel, previousNumber, rename }: DesignPreviewProps) {
  const positions = useMemo(() => [...new Set([...current, ...previous].map((asset) => asset.position))].sort((left, right) => left - right), [current, previous]);
  const [position, setPosition] = useState(positions[0] ?? 0);
  const [background, setBackground] = useState<CanvasBackground>("white");
  const [comparison, setComparison] = useState<ComparisonMode>("side-by-side");
  const [zoom, setZoom] = useState(100);
  const [sizes, setSizes] = useState<Record<string, ImageSize>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!positions.includes(position)) setPosition(positions[0] ?? 0);
  }, [position, positions]);

  const currentAsset = current.find((asset) => asset.position === position);
  const previousAsset = previous.find((asset) => asset.position === position);
  const currentKey = currentAsset && previewAssetKey("current", currentAsset);
  const previousKey = previousAsset && previewAssetKey("previous", previousAsset);
  const imagePair = isRaster(currentAsset) && isRaster(previousAsset) && !failed[currentKey!] && !failed[previousKey!];
  const overlayAvailable = imagePair && sameSize(sizes[currentKey!], sizes[previousKey!]);
  const overlay = comparison === "overlay" && overlayAvailable;
  const canZoom = Boolean(currentAsset || previousAsset) && !rename;

  useEffect(() => {
    if (!overlayAvailable && comparison === "overlay") setComparison("side-by-side");
  }, [comparison, overlayAvailable]);

  const recordSize = useCallback((side: "current" | "previous", asset: DesignPreviewAsset, element: HTMLImageElement) => {
    const key = previewAssetKey(side, asset);
    const width = element.naturalWidth;
    const height = element.naturalHeight;
    if (!width || !height) return;
    setSizes((values) => values[key]?.[0] === width && values[key]?.[1] === height ? values : { ...values, [key]: [width, height] });
    setFailed((values) => values[key] ? { ...values, [key]: false } : values);
  }, []);

  const markFailed = useCallback((side: "current" | "previous", asset: DesignPreviewAsset) => {
    const key = previewAssetKey(side, asset);
    setFailed((values) => values[key] ? values : { ...values, [key]: true });
  }, []);

  if (rename) return <section aria-labelledby="design-preview-heading" className={styles.preview}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Comparison</p><h2 id="design-preview-heading">Name change</h2></div></header>
    <div className={styles.rename}><div><span>{previousLabel}</span><strong>{rename.previousName}</strong></div><Icon aria-hidden name="rename" size={24} /><div><span>{currentLabel}</span><strong>{rename.currentName}</strong></div><p>Name only; source content is unchanged.</p></div>
  </section>;

  return <section aria-labelledby="design-preview-heading" className={styles.preview}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Comparison</p><h2 id="design-preview-heading">Design preview</h2></div>
      {positions.length > 1 && <div aria-label="Preview thumbnails" className={styles.thumbnails}>{positions.map((itemPosition) => {
        const asset = current.find((item) => item.position === itemPosition) ?? previous.find((item) => item.position === itemPosition);
        return <button aria-pressed={position === itemPosition} className={styles.thumbnail} data-active={position === itemPosition || undefined} key={itemPosition} onClick={() => setPosition(itemPosition)} type="button">
          {asset && <img alt="" src={asset.url} />}<span>Preview {itemPosition + 1}</span>
        </button>;
      })}</div>}
    </header>
    <div className={styles.toolbar}>
      <SegmentedControl items={[{ value: "side-by-side", label: "Side by side" }, { value: "overlay", label: "Overlay", disabled: !overlayAvailable }]} label="Comparison mode" onChange={(value) => setComparison(value as ComparisonMode)} value={comparison} />
      <label className={styles.background}><span>Canvas</span><select onChange={(event) => setBackground(event.target.value as CanvasBackground)} value={background}><option value="white">White</option><option value="gray">Gray</option><option value="black">Black</option><option value="checker">Checker</option></select></label>
      {canZoom && <div className={styles.zoomControls}><IconButton disabled={zoom <= 100} label="Zoom out" onClick={() => setZoom((value) => Math.max(100, value - 25))} size="sm"><Icon name="minus" size={16} /></IconButton><span aria-live="polite">{zoom}%</span><IconButton disabled={zoom >= 200} label="Zoom in" onClick={() => setZoom((value) => Math.min(200, value + 25))} size="sm"><Icon name="zoom" size={16} /></IconButton></div>}
    </div>
    {!overlayAvailable && currentAsset && previousAsset && <p className={styles.requirement}>Overlay requires matching PNG or JPG dimensions.</p>}
    {!currentAsset && !previousAsset ? <p className={styles.empty}>No accessible preview is available for this change.</p> : <div className={styles.viewport} data-background={background}>
      <div className={styles.frame} style={canvasStyle(zoom)}>
        {overlay ? <OverlayCanvas current={currentAsset!} currentLabel={currentLabel} currentNumber={currentNumber} failed={failed} onError={markFailed} onLoad={recordSize} previous={previousAsset!} previousLabel={previousLabel} previousNumber={previousNumber} /> : <div className={styles.split}>
          <PreviewPane asset={previousAsset} label={previousLabel} missingLabel={missingPreviousLabel} number={previousNumber} side="previous" failed={failed} onError={markFailed} onLoad={recordSize} />
          <PreviewPane asset={currentAsset} label={currentLabel} missingLabel={missingCurrentLabel} number={currentNumber} side="current" failed={failed} onError={markFailed} onLoad={recordSize} />
        </div>}
      </div>
    </div>}
  </section>;
}

function PreviewImage({ asset, label, onError, onLoad, side }: { asset: DesignPreviewAsset; label: string; onError: (side: "current" | "previous", asset: DesignPreviewAsset) => void; onLoad: (side: "current" | "previous", asset: DesignPreviewAsset, element: HTMLImageElement) => void; side: "current" | "previous" }) {
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const element = image.current;
    if (!element?.complete) return;
    if (element.naturalWidth && element.naturalHeight) onLoad(side, asset, element);
    else onError(side, asset);
  }, [asset, onError, onLoad, side]);

  return <img alt={asset.altText || `${label} preview`} onError={() => onError(side, asset)} onLoad={(event) => onLoad(side, asset, event.currentTarget)} ref={image} src={asset.url} />;
}

function PreviewPane({ asset, failed, label, missingLabel, number, onError, onLoad, side }: { asset: DesignPreviewAsset | undefined; failed: Record<string, boolean>; label: string; missingLabel: string; number?: number; onError: (side: "current" | "previous", asset: DesignPreviewAsset) => void; onLoad: (side: "current" | "previous", asset: DesignPreviewAsset, element: HTMLImageElement) => void; side: "current" | "previous" }) {
  const failedAsset = asset && failed[previewAssetKey(side, asset)];
  return <figure className={styles.pane}><figcaption>{label}{number ? ` Revision ${number}` : ""}</figcaption><div className={styles.canvas}>{!asset ? <p>{missingLabel}</p> : !isRaster(asset) ? <p>Unsupported preview format.</p> : failedAsset ? <p>Preview could not be loaded.</p> : <PreviewImage asset={asset} label={label} onError={onError} onLoad={onLoad} side={side} />}</div></figure>;
}

function OverlayCanvas({ current, currentLabel, currentNumber, failed, onError, onLoad, previous, previousLabel, previousNumber }: { current: DesignPreviewAsset; currentLabel: string; currentNumber: number; failed: Record<string, boolean>; onError: (side: "current" | "previous", asset: DesignPreviewAsset) => void; onLoad: (side: "current" | "previous", asset: DesignPreviewAsset, element: HTMLImageElement) => void; previous: DesignPreviewAsset; previousLabel: string; previousNumber?: number }) {
  const currentFailed = failed[previewAssetKey("current", current)];
  const previousFailed = failed[previewAssetKey("previous", previous)];
  return <figure className={styles.overlay}><figcaption>{previousLabel}{previousNumber ? ` Revision ${previousNumber}` : ""} overlaid with {currentLabel} Revision {currentNumber}</figcaption><div className={styles.overlayCanvas}>{previousFailed || currentFailed ? <p>Preview could not be loaded.</p> : <><PreviewImage asset={previous} label={previousLabel} onError={onError} onLoad={onLoad} side="previous" /><PreviewImage asset={current} label={currentLabel} onError={onError} onLoad={onLoad} side="current" /></>}</div></figure>;
}
