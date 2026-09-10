"use client";

import type { ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { uiCopy } from "@/src/lib/ui/copy";
import styles from "./review-action-bar.module.css";

type ReviewActionBarProps = {
  totalCount: number;
  approvedCount: number;
  pendingCount: number;
  requestedCount: number;
  applicableCount: number;
  selectedCount: number;
  appliedCount: number;
  canApply: boolean;
  allSelected: boolean;
  selectionDisabled: boolean;
  applying: boolean;
  stale: boolean;
  staleConfirmed: boolean;
  unitResultUnknown: boolean;
  emptyResult: boolean;
  blockedApprovedCount: number;
  selectionNotice: string;
  onSelectAll: (selected: boolean) => void;
  onOpenApply: () => void;
  closeAction?: ReactNode;
};

export function ReviewActionBar({ allSelected, applicableCount, appliedCount, applying, approvedCount, blockedApprovedCount, canApply, closeAction, emptyResult, onOpenApply, onSelectAll, pendingCount, requestedCount, selectedCount, selectionDisabled, selectionNotice, stale, staleConfirmed, totalCount, unitResultUnknown }: ReviewActionBarProps) {
  const applyDisabled = !canApply || applying || !selectedCount || (stale && !staleConfirmed) || unitResultUnknown || emptyResult;
  const applyLabel = `Apply ${selectedCount} selected`;

  return <section aria-labelledby="review-actions-heading" className={styles.bar}>
    <div className={styles.summary}>
      <h2 id="review-actions-heading">Application</h2>
      <p className={styles.summaryLine} aria-live="polite">{totalCount} total {totalCount === 1 ? "change" : "changes"}, {approvedCount} approved · unapplied, {selectedCount} selected</p>
      <dl className={styles.counts}>
        <div><dt>Total</dt><dd>{totalCount}</dd></div>
        <div><dt>Pending</dt><dd>{pendingCount}</dd></div>
        <div><dt>Approved</dt><dd>{approvedCount}</dd></div>
        <div><dt>Changes requested</dt><dd>{requestedCount}</dd></div>
        <div><dt>Eligible</dt><dd>{applicableCount}</dd></div>
        <div><dt>Selected</dt><dd>{selectedCount}</dd></div>
        {appliedCount > 0 && <div><dt>Applied</dt><dd>{appliedCount}</dd></div>}
      </dl>
    </div>
    <div className={styles.controls}>
      {canApply && applicableCount > 0 && <Checkbox checked={allSelected} disabled={selectionDisabled} id="select-all-eligible-changes" label="Select all eligible approved changes for application" onChange={(event) => onSelectAll(event.target.checked)} />}
      <div className={styles.actions}>
        <Button aria-label={applying ? undefined : `${applyLabel} changes`} disabled={applyDisabled} loading={applying} loadingLabel={uiCopy.loading.applying} onClick={onOpenApply} size="lg">{applying ? uiCopy.loading.applying : `${applyLabel} changes`}</Button>
        {closeAction}
      </div>
    </div>
    <div aria-live="polite" className={styles.notices}>
      {canApply && applicableCount > 0 && !selectedCount && <p>Select approved changes to create a new revision. Selecting a change does not apply it and does not change its review state.</p>}
      {!canApply && <p>Only the project owner can select approved changes for application.</p>}
      {blockedApprovedCount > 0 && <p>{blockedApprovedCount} approved {blockedApprovedCount === 1 ? "change is" : "changes are"} blocked pending review.</p>}
      {unitResultUnknown && <p>Checking latest units...</p>}
      {emptyResult && <p className={styles.error}>At least one unit must remain. Deselect a removal or select an approved addition.</p>}
      {stale && !staleConfirmed && <p>Review and confirm the latest revision before applying.</p>}
      {selectionNotice && <p>{selectionNotice}</p>}
    </div>
  </section>;
}
