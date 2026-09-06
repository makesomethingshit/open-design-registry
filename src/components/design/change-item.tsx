"use client";

import { changeReviewStatusPresentation, type StatusPresentation } from "@/src/lib/ui/status-presentation";
import { Icon, type IconName } from "@/src/components/ui/icon";
import { StatusBadge } from "@/src/components/ui/badge";
import type { ReviewChange } from "./review-types";
import styles from "./change-item.module.css";

type ChangePresentation = Readonly<{ label: string; icon: IconName; description: string }>;

const actionPresentations: Record<string, ChangePresentation> = {
  ADD_UNIT: { label: "Added", icon: "plus", description: "Present only in the proposal." },
  MODIFY_UNIT: { label: "Modified", icon: "pencil", description: "Source content changed." },
  REMOVE_UNIT: { label: "Removed", icon: "minus", description: "Removed from the next revision." },
  RENAME_UNIT: { label: "Renamed", icon: "rename", description: "Name changed; source content is unchanged." },
  REPLACE_ASSET: { label: "Asset replaced", icon: "image", description: "The source asset was replaced." },
  REPLACE_DOCUMENT: { label: "Whole document", icon: "file", description: "This applies to the entire document." },
};

const conflictPresentations: Record<NonNullable<ReviewChange["conflictStatus"]>, StatusPresentation> = {
  NO_CONFLICT: { label: "No conflict", tone: "neutral", icon: "check" },
  CONFLICT: { label: "Conflict", tone: "warning", icon: "warning" },
  CHECK_UNAVAILABLE: { label: "Check unavailable", tone: "warning", icon: "warning" },
};

const kindLabels: Record<string, string> = {
  artboard: "Artboard",
  component: "Component",
  asset: "Asset",
  token: "Token",
};

export function changeActionPresentation(change: Pick<ReviewChange, "action" | "type">): ChangePresentation {
  return actionPresentations[change.action] ?? actionPresentations[change.type] ?? { label: "Changed", icon: "file", description: "Change details are available in the review inspector." };
}

export function changeKindLabel(kind: string | null) {
  if (!kind) return "Asset - legacy";
  return kindLabels[kind] ?? "Other unit";
}

export function changeDisplayName(change: Pick<ReviewChange, "action" | "type" | "name" | "newName" | "target">) {
  const name = change.name ?? change.target;
  if (change.action === "RENAME_UNIT") return `Rename ${name} to ${change.newName ?? "new name"}`;
  if (change.action === "ADD_UNIT") return `Add ${name}`;
  if (change.action === "REMOVE_UNIT") return `Remove ${name}`;
  if (change.action === "MODIFY_UNIT") return `Modify ${name}`;
  return change.type === "REPLACE_DOCUMENT" ? "Whole document" : name;
}

export function conflictStatusPresentation(status: ReviewChange["conflictStatus"]) {
  return status ? conflictPresentations[status] : null;
}

type ChangeItemProps = {
  change: ReviewChange;
  viewed: boolean;
  selected: boolean;
  showSelection: boolean;
  selectable: boolean;
  applying: boolean;
  onView: (changeId: string) => void;
  onSelect: (changeId: string, selected: boolean) => void;
};

export function ChangeItem({ applying, change, onSelect, onView, selectable, selected, showSelection, viewed }: ChangeItemProps) {
  const action = changeActionPresentation(change);
  const status = changeReviewStatusPresentation(change.reviewStatus, change.appliedRevision?.number);
  const conflict = conflictStatusPresentation(change.conflictStatus);
  const conflictId = `conflict-${change.id}`;
  const displayName = changeDisplayName(change);

  return <li className={styles.item} data-viewed={viewed || undefined}>
    {showSelection && <label className={styles.selection}>
      <input aria-describedby={!selectable && change.conflictReason ? conflictId : undefined} aria-label={`Select ${displayName}`} checked={selected} disabled={!selectable || applying} onChange={(event) => onSelect(change.id, event.target.checked)} type="checkbox" />
      <span className="sr-only">Select {displayName}</span>
    </label>}
    <button aria-current={viewed ? "true" : undefined} className={styles.summary} onClick={() => onView(change.id)} type="button">
      <span className={styles.icon}><Icon name={action.icon} size={16} /></span>
      <span className={styles.text}><strong>{displayName}</strong><span>{action.label} - {changeKindLabel(change.kind)}</span></span>
    </button>
    <div className={styles.badges}>
      <StatusBadge icon={status.icon} tone={status.tone}>{status.label}</StatusBadge>
      {conflict && <StatusBadge icon={conflict.icon} tone={conflict.tone}>{conflict.label}</StatusBadge>}
    </div>
    {change.conflictReason && <p className={styles.reason} id={conflictId}>{change.conflictReason}{!selectable && change.conflictStatus && change.conflictStatus !== "NO_CONFLICT" ? " Cannot select." : ""}</p>}
  </li>;
}
