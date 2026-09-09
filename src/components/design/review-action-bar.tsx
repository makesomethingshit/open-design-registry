"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@/src/components/ui/checkbox";
import { changeDisplayName, removalWarning } from "./change-item";
import type { ReviewChange } from "./review-types";
import styles from "./review-action-bar.module.css";

type ReviewActionBarProps = {
  totalCount: number;
  approvedCount: number;
  pendingCount: number;
  requestedCount: number;
  applicableCount: number;
  canSelect: boolean;
  selectedCount: number;
  appliedCount: number;
  allSelected: boolean;
  emptyResult: boolean;
  blockedApprovedCount: number;
  removalCount: number;
  wholeDocumentReplacement: boolean;
  selectedChanges: ReviewChange[];
  selectionNotice: string;
  stale: boolean;
  unitResultUnknown: boolean;
  onSelectAll: (selected: boolean) => void;
  closeAction?: ReactNode;
};

export function ReviewActionBar({ allSelected, applicableCount, appliedCount, approvedCount, blockedApprovedCount, canSelect, closeAction, emptyResult, onSelectAll, pendingCount, removalCount, requestedCount, selectedChanges, selectedCount, selectionNotice, stale, totalCount, unitResultUnknown, wholeDocumentReplacement }: ReviewActionBarProps) {
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
      {canSelect && applicableCount > 0 && <Checkbox checked={allSelected} id="select-all-eligible-changes" label="Select all eligible approved changes for application" onChange={(event) => onSelectAll(event.target.checked)} />}
      <div className={styles.actions}>
        <p className={styles.deferredNotice} role="note">Application runs in a later stage. Selection only marks candidates; nothing is applied here.</p>
        {closeAction}
      </div>
    </div>
    <div aria-live="polite" className={styles.notices}>
      {canSelect && applicableCount > 0 && !selectedCount && <p>Select approved changes for application. Selecting a change does not apply it and does not change its review state.</p>}
      {!canSelect && <p>Only the project owner can select approved changes for application.</p>}
      {blockedApprovedCount > 0 && <p>{blockedApprovedCount} approved {blockedApprovedCount === 1 ? "change is" : "changes are"} blocked pending review.</p>}
      {unitResultUnknown && <p>Checking latest units...</p>}
      {emptyResult && <p className={styles.error}>At least one unit must remain. Deselect a removal or select an approved addition.</p>}
      {stale && <p>Review the latest revision. Selection is preserved; application is unavailable in this stage.</p>}
      {selectionNotice && <p>{selectionNotice}</p>}
      {selectedCount > 0 && <div className={styles.selectionPreview}>
        <p>{selectedCount} selected for a later application:</p>
        <ul>{selectedChanges.map((change) => <li key={change.id}>{changeDisplayName(change)}</li>)}</ul>
        {wholeDocumentReplacement && <p>This replaces the entire current document. Individual units from the current revision will not be preserved.</p>}
        {!wholeDocumentReplacement && <p>Unselected units in the current revision will be kept.</p>}
        {removalCount > 0 && <p>{removalWarning(removalCount)}</p>}
      </div>}
    </div>
  </section>;
}
