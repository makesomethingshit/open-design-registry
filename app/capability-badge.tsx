"use client";

import { useId, useState } from "react";

type CapabilityBadgeProps = {
  mode?: string | null;
  unitCount?: number | null;
  label?: string;
  provisional?: boolean;
  adapterId?: string | null;
  adapterVersion?: string | null;
  adapterConfidence?: string | null;
  adapterMaturity?: string | null;
};

export function capabilityText(mode?: string | null, unitCount?: number | null) {
  if (mode === "STRUCTURED" || mode === "structured") {
    const count = unitCount ?? 0;
    return `Structured merge · ${count} ${count === 1 ? "unit" : "units"}`;
  }
  if (mode === "WHOLE_DOCUMENT" || mode === "whole_document") return "Whole-document only";
  return "Capability unavailable";
}

export default function CapabilityBadge({ mode, unitCount, label, provisional = false, adapterId, adapterVersion, adapterConfidence, adapterMaturity }: CapabilityBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const structured = mode === "STRUCTURED" || mode === "structured";
  const wholeDocument = mode === "WHOLE_DOCUMENT" || mode === "whole_document";
  return <div className="capability-badge">
    <p className="meta">{label ? `${label}: ` : ""}{capabilityText(mode, unitCount)}{structured && <> · File-level units only</>}{wholeDocument && <> · The original document is applied as a whole.</>}{provisional && <> · Pending publication</>}</p>
    <button type="button" className="link-button capability-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}>Capability details</button>
    {expanded && <div id={detailsId} className="capability-details"><dl><div><dt>Adapter</dt><dd>{adapterId ?? "Not recorded"}</dd></div><div><dt>Version</dt><dd>{adapterVersion ?? "Not recorded"}</dd></div><div><dt>Maturity</dt><dd>{adapterMaturity ?? "Not recorded"}</dd></div><div><dt>Suggestion confidence</dt><dd>{adapterConfidence?.replaceAll("_", " ").toLowerCase() ?? "Not assessed"}</dd></div></dl><p className="meta">This describes kind suggestions, not conflict detection or approval.</p></div>}
  </div>;
}
