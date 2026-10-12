"use client";

import { FormEvent } from "react";
import { Banner } from "@/src/components/ui/banner";
import { StatusBadge } from "@/src/components/ui/badge";
import { Button, TextLink } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { Field, Textarea } from "@/src/components/ui/field";
import { changeActionPresentation, changeDisplayName, changeKindLabel, conflictStatusPresentation } from "./change-item";
import type { ReviewChange } from "./review-types";
import { changeReviewStatusPresentation } from "@/src/lib/ui/status-presentation";
import styles from "./review-inspector.module.css";

function fileSize(size: number | null) {
  if (size == null) return null;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function historyLabel(entry: ReviewChange["reviewHistory"][number]) {
  if (entry.eventType === "REVIEW") return changeReviewStatusPresentation(entry.status).label;
  if (entry.eventType === "INVALIDATED_UPSTREAM") return "Approval dismissed";
  return "Re-review required";
}

export type FailedReviewRequest = {
  status: "APPROVED" | "CHANGES_REQUESTED";
  comment: string;
};

type ReviewInspectorProps = {
  change: ReviewChange | undefined;
  canReview: boolean;
  applying: boolean;
  pending: boolean;
  error: string;
  failedRequest: FailedReviewRequest | null;
  requestingChanges: boolean;
  draft: string;
  projectSlug: string;
  reviseHref?: string;
  proposalClosed?: boolean;
  onReview: (reviewStatus: "APPROVED" | "CHANGES_REQUESTED", comment?: string) => Promise<boolean>;
  onRetry: () => Promise<boolean>;
  onRequestingChangesChange: (requesting: boolean) => void;
  onDraftChange: (draft: string) => void;
};

export function ReviewInspector({ applying, canReview, change, draft, error, failedRequest, onDraftChange, onRequestingChangesChange, onRetry, onReview, pending, projectSlug, requestingChanges, reviseHref, proposalClosed }: ReviewInspectorProps) {

  if (!change) return <section aria-labelledby="review-inspector-heading" className={styles.inspector}><h2 id="review-inspector-heading">Review inspector</h2><p className={styles.empty}>Select a change to inspect its actual review data.</p></section>;

  const action = changeActionPresentation(change);
  const status = changeReviewStatusPresentation(change.reviewStatus, change.appliedRevision?.number);
  const conflict = conflictStatusPresentation(change.conflictStatus);
  const reviewDisabled = applying || pending || !canReview;
  const requestFormId = `request-changes-${change.id}`;

  async function requestChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = await onReview("CHANGES_REQUESTED", draft);
    // Keep the dialog open with the draft preserved when the review fails so the
    // in-dialog error and resubmit stay reachable.
    if (submitted) onRequestingChangesChange(false);
  }
  const requestError = requestingChanges && failedRequest && failedRequest.status === "CHANGES_REQUESTED" ? error : "";

  function formatHistoryDate(value: ReviewChange["reviewHistory"][number]["createdAt"]) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : `${date.toLocaleString("en-US", { timeZone: "UTC" })} UTC`;
  }

  return <section aria-labelledby="review-inspector-heading" className={styles.inspector}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{action.label}</p><h2 id="review-inspector-heading">{changeDisplayName(change)}</h2></div>
      <p role="status" aria-live="polite" className={styles.liveStatus}><StatusBadge icon={status.icon} tone={status.tone}>{status.label}</StatusBadge></p>
    </header>
    <dl className={styles.details}>
      <div><dt>Kind</dt><dd>{changeKindLabel(change.kind)}</dd></div>
      {change.mimeType && <div><dt>Format</dt><dd>{change.mimeType}</dd></div>}
      {fileSize(change.size) && <div><dt>Size</dt><dd>{fileSize(change.size)}</dd></div>}
      {change.targetFileId && <div><dt>Target ID</dt><dd className={styles.identifier}>{change.targetFileId}</dd></div>}
      {change.action === "RENAME_UNIT" && <div><dt>Proposed name</dt><dd>{change.newName ?? "Not available"}</dd></div>}
    </dl>
    <p className={styles.description}>{action.description}</p>
    {conflict && <StatusBadge icon={conflict.icon} tone={conflict.tone}>{conflict.label}</StatusBadge>}
    {change.conflictReason && <p className={styles.note}>{change.conflictReason}</p>}
    {!change.latestAvailable && change.conflictStatus !== "CHECK_UNAVAILABLE" && <Banner tone="warning" title="Not in the latest revision">This unit cannot be selected until the latest revision is reviewed.</Banner>}
    {change.reviewComment && <section className={styles.reviewComment}><h3>Latest review</h3><p>{change.reviewComment}</p></section>}
    <section aria-label="Next step for this change" className={styles.reviewComment}>
      <h3>{change.appliedRevision ? "Applied to the original" : proposalClosed ? "Proposal closed" : change.reviewStatus === "CHANGES_REQUESTED" ? "Changes requested: revise your work" : change.reviewStatus === "APPROVED" ? "Approved, awaiting application" : canReview ? "Review this proposed change" : "Waiting for owner review"}</h3>
      {change.appliedRevision ? <>
        <p>The owner added this change to a new Revision of the original project. Other changes may still be awaiting review or application.</p>
        <TextLink href={`/projects/${projectSlug}/revisions/${change.appliedRevision.number}`}>View Revision {change.appliedRevision.number}</TextLink>
      </> : proposalClosed ? <p>This Proposal is closed. Its unapplied changes will not be added to the original through this Proposal.</p> : change.reviewStatus === "CHANGES_REQUESTED" ? <>
        <p>Read the owner's feedback. Edit the source in your design tool, publish another Revision, then create a new Proposal. This Proposal keeps the original submitted work.</p>
        {reviseHref && <TextLink href={reviseHref}>Prepare revised work</TextLink>}
      </> : change.reviewStatus === "APPROVED" ? <p>The owner approved this change, but it has not changed the original yet. Only the owner can select and apply approved changes in a new Revision.</p> : <p>{canReview ? "Compare the proposed work with the original, then approve this change or request changes with feedback. Approval does not apply it yet." : "This Proposal is submitted. The original project owner reviews each change here; submitting does not change the original. Return to this page to check feedback and results."}</p>}
    </section>
    <section className={styles.history} aria-label="Unit review history"><h3>Unit review history</h3>{change.reviewHistory.length > 0 ? <ol>{change.reviewHistory.map((entry) => <li key={entry.id}><strong>{historyLabel(entry)}</strong>{entry.author?.name && <span>{entry.author.name}</span>}{entry.comment && <p>{entry.comment}</p>}{entry.reason && <p>{entry.reason}</p>}{entry.causedByRevision && <span>Revision {entry.causedByRevision.number}</span>}<span>{formatHistoryDate(entry.createdAt)}</span></li>)}</ol> : <p className={styles.emptyHistory}>No unit reviews yet.</p>}</section>
    {canReview && <div className={styles.actions}>
      <Button disabled={reviewDisabled || change.conflictStatus === "CONFLICT" || change.conflictStatus === "CHECK_UNAVAILABLE"} loading={pending && !requestingChanges} loadingLabel="Saving review" onClick={() => { void onReview("APPROVED"); }} variant="secondary">Approve change</Button>
      <Button disabled={reviewDisabled} onClick={() => onRequestingChangesChange(true)} variant="secondary">Request changes</Button>
    </div>}
    <Dialog actions={<><Button disabled={reviewDisabled} onClick={() => onRequestingChangesChange(false)} size="lg" variant="secondary">Cancel</Button><Button disabled={!draft.trim() || reviewDisabled} form={requestFormId} loading={pending} loadingLabel="Saving review" size="lg" type="submit">Submit review</Button></>} onClose={() => onRequestingChangesChange(false)} open={requestingChanges && canReview} title="Request changes">
      <form className={styles.requestForm} id={requestFormId} onSubmit={requestChanges}>
        <Field id={`review-comment-${change.id}`} label={`Feedback for ${changeDisplayName(change)}`} required><Textarea disabled={reviewDisabled} maxLength={10000} name="comment" onChange={(event) => onDraftChange(event.target.value)} value={draft} /></Field>
        {requestError && <Banner action={<Button disabled={reviewDisabled || !failedRequest} onClick={() => { void onRetry(); }} size="sm" variant="secondary">Retry</Button>} tone="error" title="Could not update review.">{requestError}</Banner>}
      </form>
    </Dialog>
    {error && !requestingChanges && <Banner action={<Button disabled={reviewDisabled || !failedRequest} onClick={() => { void onRetry(); }} size="sm" variant="secondary">Retry</Button>} tone="error" title="Could not update review.">{error}</Banner>}
  </section>;
}
