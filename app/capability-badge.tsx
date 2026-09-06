type CapabilityBadgeProps = {
  mode?: string | null;
  unitCount?: number | null;
  label?: string;
  provisional?: boolean;
};

export function capabilityText(mode?: string | null, unitCount?: number | null) {
  if (mode === "STRUCTURED" || mode === "structured") {
    const count = unitCount ?? 0;
    return `Structured merge · ${count} ${count === 1 ? "unit" : "units"}`;
  }
  if (mode === "WHOLE_DOCUMENT" || mode === "whole_document") return "Whole-document only";
  return "Capability unavailable";
}

export default function CapabilityBadge({ mode, unitCount, label, provisional = false }: CapabilityBadgeProps) {
  const structured = mode === "STRUCTURED" || mode === "structured";
  const wholeDocument = mode === "WHOLE_DOCUMENT" || mode === "whole_document";
  return <p className="meta capability-badge">{label ? `${label}: ` : ""}{capabilityText(mode, unitCount)}{structured && <> · File-level units only</>}{wholeDocument && <> · The original document is applied as a whole.</>}{provisional && <> · Pending publication</>}</p>;
}
