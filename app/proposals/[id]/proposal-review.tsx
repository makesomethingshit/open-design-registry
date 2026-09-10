"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { ChangeItem, applicationSelectionLabel, changeDisplayName, removalWarning } from "@/src/components/design/change-item";
import { DesignPreview } from "@/src/components/design/design-preview";
import { Dialog } from "@/src/components/ui/dialog";
import { ReviewActionBar } from "@/src/components/design/review-action-bar";
import { ReviewInspector } from "@/src/components/design/review-inspector";
import type { FailedReviewRequest } from "@/src/components/design/review-inspector";
import type { ReviewChange, ReviewComment, ReviewRevision } from "@/src/components/design/review-types";
import styles from "./proposal-review.module.css";

type ApplyRevision = Pick<ReviewRevision, "id" | "number" | "title">;
type ApplySuccess = { revision: ApplyRevision; appliedChangeIds: string[] };

function revisionFromUnknown(value: unknown): ApplyRevision | null {
  if (!value || typeof value !== "object") return null;
  const revision = value as { id?: unknown; number?: unknown; title?: unknown };
  if (typeof revision.id !== "string" || !Number.isInteger(revision.number)) return null;
  return { id: revision.id, number: revision.number as number, title: typeof revision.title === "string" ? revision.title : "Applied changes" };
}

function applyRevisionFromResponse(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  return revisionFromUnknown((payload as { revision?: unknown }).revision);
}

function appliedResultFromProposal(payload: unknown, requestedIds: string[]) {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { changeSet?: { changes?: unknown } };
  if (!value.changeSet || !Array.isArray(value.changeSet.changes)) return null;
  const requested = new Set(requestedIds);
  const applied = value.changeSet.changes.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const change = item as { id?: unknown; appliedRevision?: unknown };
    if (typeof change.id !== "string" || !requested.has(change.id)) return [];
    const revision = revisionFromUnknown(change.appliedRevision);
    return revision ? [{ id: change.id, revision }] : [];
  });
  if (!applied.length) return { appliedChangeIds: [] as string[], revision: null };
  return { appliedChangeIds: applied.map((item) => item.id), revision: applied[0].revision };
}

export function selectedUnitResultCount(latestUnitCount: number | null, changes: Array<Pick<ReviewChange, "id" | "action" | "type">>, selectedChangeIds: string[]) {
  if (latestUnitCount == null) return null;
  return latestUnitCount + selectedChangeIds.reduce((count, id) => {
    const action = changes.find((change) => change.id === id)?.action;
    return action === "ADD_UNIT" ? count + 1 : action === "REMOVE_UNIT" ? count - 1 : count;
  }, 0);
}

export { removalWarning } from "@/src/components/design/change-item";

export function selectedIdsAfterConflict(selectedChangeIds: string[], payload: unknown) {
  const conflictChangeIds = payload && typeof payload === "object" && Array.isArray((payload as { conflictChangeIds?: unknown }).conflictChangeIds)
    ? (payload as { conflictChangeIds: unknown[] }).conflictChangeIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!conflictChangeIds.length) return selectedChangeIds;
  const conflicts = new Set(conflictChangeIds);
  return selectedChangeIds.filter((id) => !conflicts.has(id));
}

export function includesWholeDocumentReplacement(changes: Array<Pick<ReviewChange, "id" | "action" | "type">>, selectedChangeIds: string[]) {
  return changes.some((change) => selectedChangeIds.includes(change.id) && (change.action === "REPLACE_DOCUMENT" || change.type === "REPLACE_DOCUMENT"));
}

/**
 * Applies application-selection eligibility after a server refresh.
 * Actual selection cleanup runs in the effect above from refreshed props;
 * this helper exposes the same rule for unit tests. Review API failures
 * never touch this: only a server response that marks a change Applied
 * (or otherwise ineligible) drops it.
 */
export function selectionAfterServerChanges(
  selectedChangeIds: string[],
  changes: Array<Pick<ReviewChange, "id" | "reviewStatus" | "appliedRevision">>,
  eligibility: (change: Pick<ReviewChange, "id" | "reviewStatus" | "appliedRevision">) => boolean,
) {
  const byId = new Map(changes.map((change) => [change.id, change]));
  const dropped = selectedChangeIds.filter((id) => {
    const change = byId.get(id);
    return !change || !eligibility(change);
  });
  return { selected: selectedChangeIds.filter((id) => !dropped.includes(id)), dropped };
}

type ProposalReviewProps = {
  proposalId: string;
  projectSlug: string;
  baseRevision: ReviewRevision;
  sourceRevision: ReviewRevision;
  latestRevision: ReviewRevision | null;
  latestUnitCount: number | null;
  stale: boolean;
  knownConflictCount: number;
  unavailableConflictCount: number;
  status: string;
  changes: ReviewChange[];
  comments: ReviewComment[];
  signedIn: boolean;
  isOwner: boolean;
  canClose: boolean;
};

export default function ProposalReview({ proposalId, projectSlug, baseRevision, sourceRevision, latestRevision, latestUnitCount, stale, knownConflictCount, unavailableConflictCount, status, changes, comments, signedIn, isOwner, canClose }: ProposalReviewProps) {
  const router = useRouter();
  const [viewedChangeId, setViewedChangeId] = useState(changes[0]?.id ?? "");
  const [reviewingLatest, setReviewingLatest] = useState(false);
  const [confirmedLatest, setConfirmedLatest] = useState(false);
  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([]);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [pendingChangeIds, setPendingChangeIds] = useState<string[]>([]);
  const [commenting, setCommenting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
  const [failedReviews, setFailedReviews] = useState<Record<string, FailedReviewRequest>>({});
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applyRetryAllowed, setApplyRetryAllowed] = useState(false);
  const [applySuccess, setApplySuccess] = useState<ApplySuccess | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [requestingChangeIds, setRequestingChangeIds] = useState<Record<string, boolean>>({});
  const [commentError, setCommentError] = useState("");
  const [closeError, setCloseError] = useState("");
  const [focusLatestReview, setFocusLatestReview] = useState(false);
  const pendingChangeIdsRef = useRef(new Set<string>());
  const applyingRef = useRef(false);
  const commentingRef = useRef(false);
  const closingRef = useRef(false);

  const effectiveChanges = useMemo(() => {
    if (!applySuccess) return changes;
    const appliedIds = new Set(applySuccess.appliedChangeIds);
    return changes.map((change) => appliedIds.has(change.id) && !change.appliedRevision ? { ...change, appliedRevision: applySuccess.revision } : change);
  }, [applySuccess, changes]);
  const approvedChanges = useMemo(() => effectiveChanges.filter((change) => change.reviewStatus === "APPROVED" && !change.appliedRevision), [effectiveChanges]);
  const applicableApprovedChanges = useMemo(() => approvedChanges.filter((change) => (!stale || change.latestAvailable) && (change.conflictStatus == null || change.conflictStatus === "NO_CONFLICT")), [approvedChanges, stale]);
  const selectedChange = effectiveChanges.find((change) => change.id === viewedChangeId) ?? effectiveChanges[0];
  const applied = effectiveChanges.filter((change) => change.appliedRevision).length;
  const requested = effectiveChanges.filter((change) => !change.appliedRevision && change.reviewStatus === "CHANGES_REQUESTED").length;
  const pending = effectiveChanges.filter((change) => !change.appliedRevision && change.reviewStatus === "PENDING").length;
  const hasUnitChanges = effectiveChanges.some((change) => change.action !== "REPLACE_DOCUMENT" && change.type !== "REPLACE_DOCUMENT");
  const selectedResultCount = hasUnitChanges ? selectedUnitResultCount(latestUnitCount, effectiveChanges, selectedChangeIds) : null;
  const unitResultUnknown = hasUnitChanges && latestUnitCount == null;
  const emptyResult = selectedResultCount === 0;
  const canSelectChanges = isOwner && status !== "CLOSED" && status !== "ACCEPTED";
  const canApply = canSelectChanges && approvedChanges.length > 0;
  const removalCount = effectiveChanges.filter((change) => selectedChangeIds.includes(change.id) && change.action === "REMOVE_UNIT").length;
  const wholeDocumentReplacement = includesWholeDocumentReplacement(effectiveChanges, selectedChangeIds);
  const reviewVersion = `${latestRevision?.id ?? baseRevision.id}:${effectiveChanges.map((change) => `${change.id}:${change.checkedLatestRevisionId}:${change.conflictStatus}:${change.reviewStatus}`).join("|")}`;
  const selectedComparisonPrevious = reviewingLatest && selectedChange ? selectedChange.latestPreviews : selectedChange?.basePreviews ?? baseRevision.previews;
  const selectedComparisonCurrent = selectedChange?.sourcePreviews ?? sourceRevision.previews;
  const selectedCanReview = Boolean(isOwner && selectedChange && !selectedChange.appliedRevision && status !== "CLOSED" && status !== "ACCEPTED");
  const selectedCanSelect = Boolean(canSelectChanges && selectedChange && selectedChange.reviewStatus === "APPROVED" && !selectedChange.appliedRevision);
  const selectedSelectable = Boolean(selectedCanSelect && (!stale || selectedChange?.latestAvailable) && (selectedChange?.conflictStatus == null || selectedChange.conflictStatus === "NO_CONFLICT"));
  const allSelected = applicableApprovedChanges.length > 0 && selectedChangeIds.length === applicableApprovedChanges.length;

  useEffect(() => {
    if (!effectiveChanges.some((change) => change.id === viewedChangeId)) setViewedChangeId(effectiveChanges[0]?.id ?? "");
  }, [effectiveChanges, viewedChangeId]);

  useEffect(() => {
    const eligibleIds = new Set(applicableApprovedChanges.map((change) => change.id));
    setSelectedChangeIds((ids) => {
      const nextSelected = ids.filter((id) => eligibleIds.has(id));
      const removed = ids.length - nextSelected.length;
      if (removed) setSelectionNotice(`${removed} selected ${removed === 1 ? "change was" : "changes were"} removed because the latest review changed.`);
      return nextSelected;
    });
  }, [applicableApprovedChanges]);

  useEffect(() => {
    setConfirmedLatest(false);
  }, [reviewVersion, selectedChangeIds]);

  useEffect(() => {
    if (!focusLatestReview) return;
    document.getElementById(`review-latest-${proposalId}`)?.focus();
    setFocusLatestReview(false);
  }, [focusLatestReview, proposalId]);

  function viewChange(changeId: string) {
    setViewedChangeId(changeId);
  }

  function setReviewDraft(changeId: string, draft: string) {
    setReviewDrafts((drafts) => ({ ...drafts, [changeId]: draft }));
  }

  function setRequestingChanges(changeId: string, requesting: boolean) {
    setRequestingChangeIds((ids) => ({ ...ids, [changeId]: requesting }));
  }

  function toggleSelection(changeId: string, selected: boolean) {
    setSelectedChangeIds((ids) => selected ? [...new Set([...ids, changeId])] : ids.filter((id) => id !== changeId));
  }

  function recoverFromConflict(payload: unknown) {
    setSelectedChangeIds((ids) => {
      const nextSelected = selectedIdsAfterConflict(ids, payload);
      const removed = ids.length - nextSelected.length;
      if (removed) setSelectionNotice(`${removed} selected ${removed === 1 ? "change needs" : "changes need"} conflict review.`);
      return nextSelected;
    });
    setConfirmedLatest(false);
    setReviewingLatest(false);
    setConfirmApply(false);
    setApplyRetryAllowed(false);
    if (stale) setFocusLatestReview(true);
    router.refresh();
  }

  async function review(changeId: string, reviewStatus: "APPROVED" | "CHANGES_REQUESTED", comment = "") {
    if (applyingRef.current || pendingChangeIdsRef.current.has(changeId)) return false;
    setReviewErrors((errors) => ({ ...errors, [changeId]: "" }));
    setFailedReviews((failed) => {
      if (!(changeId in failed)) return failed;
      const next = { ...failed };
      delete next[changeId];
      return next;
    });
    pendingChangeIdsRef.current.add(changeId);
    setPendingChangeIds((ids) => [...ids, changeId]);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/changes/${changeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: reviewStatus, comment }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setReviewErrors((errors) => ({ ...errors, [changeId]: payload?.error ?? "Could not update review. Your existing review state is unchanged." }));
        setFailedReviews((failed) => ({ ...failed, [changeId]: { status: reviewStatus, comment } }));
        if (response.status === 409) recoverFromConflict(payload);
        return false;
      }
      setReviewDraft(changeId, "");
      setRequestingChanges(changeId, false);
      router.refresh();
      return true;
    } catch {
      setReviewErrors((errors) => ({ ...errors, [changeId]: "Could not update review. Your existing review state is unchanged." }));
      setFailedReviews((failed) => ({ ...failed, [changeId]: { status: reviewStatus, comment } }));
      return false;
    } finally {
      pendingChangeIdsRef.current.delete(changeId);
      setPendingChangeIds((ids) => ids.filter((id) => id !== changeId));
    }
  }

  async function retryReview(changeId: string) {
    const failed = failedReviews[changeId];
    if (!failed) return false;
    return review(changeId, failed.status, failed.comment);
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commentingRef.current) return;
    const formElement = event.currentTarget;
    commentingRef.current = true;
    setCommenting(true);
    setCommentError("");
    try {
      const response = await fetch(`/api/proposals/${proposalId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: new FormData(formElement).get("body") }) });
      if (!response.ok) {
        setCommentError((await response.json().catch(() => null))?.error ?? "Could not add comment");
        return;
      }
      formElement.reset();
      router.refresh();
    } catch {
      setCommentError("Could not add comment. Try again.");
    } finally {
      commentingRef.current = false;
      setCommenting(false);
    }
  }

  function finishApply(revision: ApplyRevision, appliedChangeIds: string[]) {
    setApplySuccess({ revision, appliedChangeIds });
    setApplyRetryAllowed(false);
    setApplyError("");
    setConfirmApply(false);
    setSelectedChangeIds((ids) => ids.filter((id) => !appliedChangeIds.includes(id)));
    router.refresh();
  }

  async function recoverUnknownApply(requestedIds: string[]) {
    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { cache: "no-store", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Proposal status could not be checked");
      const result = appliedResultFromProposal(payload, requestedIds);
      if (!result) throw new Error("Proposal status could not be checked");
      if (result.revision && result.appliedChangeIds.length) {
        finishApply(result.revision, result.appliedChangeIds);
        return;
      }
      setApplyError("Could not confirm whether selected changes were applied. Your selection has been preserved.");
      setApplyRetryAllowed(true);
      router.refresh();
    } catch {
      setApplyError("Could not confirm whether selected changes were applied. Refresh the proposal before retrying.");
      setApplyRetryAllowed(false);
    }
  }

  async function apply() {
    if (applyingRef.current) return;
    const requestedIds = [...selectedChangeIds];
    if (!requestedIds.length) return;
    applyingRef.current = true;
    setApplying(true);
    setApplyError("");
    setApplyRetryAllowed(false);
    setApplySuccess(null);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeIds: requestedIds, ...(stale && confirmedLatest && latestRevision ? { reviewedLatestRevisionId: latestRevision.id, reviewedChangeIds: requestedIds } : {}) }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setApplyError(payload?.error ?? "Could not apply selected changes.");
        setApplyRetryAllowed(response.status !== 409);
        if (response.status === 409) recoverFromConflict(payload);
        return;
      }
      const revision = applyRevisionFromResponse(payload);
      if (revision) finishApply(revision, requestedIds);
      else await recoverUnknownApply(requestedIds);
    } catch {
      await recoverUnknownApply(requestedIds);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }

  async function close() {
    if (closingRef.current || applyingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setCloseError("");
    try {
      const response = await fetch(`/api/proposals/${proposalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) });
      if (!response.ok) {
        setCloseError((await response.json().catch(() => null))?.error ?? "Could not close proposal");
        return;
      }
      router.refresh();
    } catch {
      setCloseError("Could not close proposal. Try again.");
    } finally {
      closingRef.current = false;
      setClosing(false);
    }
  }

  const previousLabel = reviewingLatest ? "Latest project" : "Original";
  const previousNumber = reviewingLatest ? latestRevision?.number : baseRevision.number;
  const rename = selectedChange?.action === "RENAME_UNIT" ? { previousName: (reviewingLatest ? selectedChange.latestName : selectedChange.name) ?? selectedChange.target, currentName: selectedChange.newName ?? "New name" } : undefined;

  return <div className={styles.workspace} data-stale={stale || undefined}>
    {stale && <div className={styles.stale}>
      <Banner action={<Button disabled={applying} id={`review-latest-${proposalId}`} onClick={() => { setReviewingLatest((current) => !current); setConfirmedLatest(false); }} size="lg" variant="secondary">{reviewingLatest ? "Back to base comparison" : "Review latest revision"}</Button>} title={`This proposal is based on Revision ${baseRevision.number}; the project is now at Revision ${latestRevision?.number}.`} tone="warning">Latest revision changed: r{baseRevision.number} → r{latestRevision?.number}. {knownConflictCount ? `${knownConflictCount} ${knownConflictCount === 1 ? "unit changed" : "units changed"} upstream.` : "No proposed units changed upstream."}{unavailableConflictCount ? ` ${unavailableConflictCount} ${unavailableConflictCount === 1 ? "unit could" : "units could"} not be checked.` : ""} Review the latest revision before applying.</Banner>
      {reviewingLatest && <Checkbox checked={confirmedLatest} disabled={applying} id="confirm-latest-review" label={`I reviewed Revision ${latestRevision?.number} against the selected changes and understand the selected additions, modifications, removals, and renames will be applied in a new revision.`} onChange={(event) => setConfirmedLatest(event.target.checked)} />}
    </div>}
    <aside aria-labelledby="changes-heading" className={styles.rail}>
      <header className={styles.railHeader}><h2 id="changes-heading">Changes</h2><span className={styles.count}>{effectiveChanges.length}</span></header>
      <p className={styles.railHint}>Checkboxes select approved changes for application; they are not review decisions. Click a row to review it.</p>
      <label className={styles.mobilePicker}>Change<select onChange={(event) => viewChange(event.target.value)} value={selectedChange?.id ?? ""}>{effectiveChanges.map((change) => <option key={change.id} value={change.id}>{changeDisplayName(change)}</option>)}</select></label>
      <ul className={styles.changeList}>{effectiveChanges.map((change) => {
        const showSelection = canSelectChanges && change.reviewStatus === "APPROVED" && !change.appliedRevision;
        const selectable = showSelection && (!stale || change.latestAvailable) && (change.conflictStatus == null || change.conflictStatus === "NO_CONFLICT");
        return <ChangeItem applying={applying} change={change} key={change.id} onSelect={toggleSelection} onView={viewChange} selectable={selectable} selected={selectedChangeIds.includes(change.id)} showSelection={showSelection} viewed={selectedChange?.id === change.id} />;
      })}</ul>
    </aside>
    <section aria-label="Visual review" className={styles.comparison} id="visual-review">
      <DesignPreview current={selectedComparisonCurrent} currentLabel="Proposal" currentNumber={sourceRevision.number} missingCurrentLabel="Removed in this proposal" missingPreviousLabel="Not present in the original revision" previous={selectedComparisonPrevious} previousLabel={previousLabel} previousNumber={previousNumber} rename={rename} />
    </section>
    <aside className={styles.inspector}><ReviewInspector applying={applying} canReview={selectedCanReview} change={selectedChange} draft={selectedChange ? reviewDrafts[selectedChange.id] ?? "" : ""} error={selectedChange ? reviewErrors[selectedChange.id] ?? "" : ""} failedRequest={selectedChange ? failedReviews[selectedChange.id] ?? null : null} onDraftChange={(draft) => { if (selectedChange) setReviewDraft(selectedChange.id, draft); }} onRequestingChangesChange={(requesting) => { if (selectedChange) setRequestingChanges(selectedChange.id, requesting); }} onRetry={() => selectedChange ? retryReview(selectedChange.id) : Promise.resolve(false)} onReview={(reviewStatus, comment) => selectedChange ? review(selectedChange.id, reviewStatus, comment) : Promise.resolve(false)} pending={Boolean(selectedChange && pendingChangeIds.includes(selectedChange.id))} projectSlug={projectSlug} requestingChanges={Boolean(selectedChange && requestingChangeIds[selectedChange.id])} /></aside>
    {selectedCanSelect && selectedChange && <div className={styles.mobileSelection}><Checkbox checked={selectedChangeIds.includes(selectedChange.id)} description={selectedSelectable ? "Included in the next revision." : "This approved change must be reviewed against the latest revision before it can be selected."} disabled={applying || !selectedSelectable} label={applicationSelectionLabel(changeDisplayName(selectedChange))} onChange={(event) => toggleSelection(selectedChange.id, event.target.checked)} /></div>}
    <section aria-labelledby="conversation-heading" className={styles.conversation}>
      <header className={styles.conversationHeader}><h2 id="conversation-heading">Proposal conversation</h2></header>
      <p className={styles.conversationHint}>Discussion about the proposal as a whole. Per-change feedback lives in that change's review history.</p>
      {comments.length ? <div className={styles.comments}>{comments.map((item) => <article className={styles.comment} key={item.id}><p>{item.body}</p><span>{item.author.name} - {new Date(item.createdAt).toLocaleString()}</span></article>)}</div> : <p className={styles.empty}>Start the conversation.</p>}
      {signedIn && status !== "CLOSED" && <form className={styles.commentForm} onSubmit={comment}><input aria-label="Write a proposal comment" disabled={commenting} maxLength={10000} name="body" placeholder="Write a comment" required /><Button disabled={commenting} loading={commenting} loadingLabel="Saving comment" type="submit" variant="secondary">Comment</Button></form>}
      {commentError && <p className={styles.error} role="alert">{commentError}</p>}
    </section>
    <div className={styles.actionBar}>
      {applySuccess && <Banner action={<Link href={`/projects/${projectSlug}/revisions/${applySuccess.revision.number}`}>View revision r{applySuccess.revision.number}</Link>} title={`Applied ${applySuccess.appliedChangeIds.length} ${applySuccess.appliedChangeIds.length === 1 ? "change" : "changes"} · r${applySuccess.revision.number}`} tone="success">The selected changes created a new immutable revision. Other proposal changes remain unapplied.</Banner>}
      <ReviewActionBar allSelected={allSelected} applicableCount={applicableApprovedChanges.length} appliedCount={applied} applying={applying} approvedCount={approvedChanges.length} blockedApprovedCount={approvedChanges.length - applicableApprovedChanges.length} canApply={canApply} closeAction={canClose && status !== "CLOSED" && status !== "ACCEPTED" ? <Button disabled={closing || applying} loading={closing} loadingLabel="Closing proposal" onClick={() => { void close(); }} size="lg" variant="secondary">Close proposal</Button> : undefined} emptyResult={emptyResult} onOpenApply={() => { setApplyError(""); setApplyRetryAllowed(false); setConfirmApply(true); }} onSelectAll={(selected) => setSelectedChangeIds(selected ? applicableApprovedChanges.map((change) => change.id) : [])} pendingCount={pending} requestedCount={requested} selectedCount={selectedChangeIds.length} selectionDisabled={applying} selectionNotice={selectionNotice} stale={stale} staleConfirmed={confirmedLatest} totalCount={effectiveChanges.length} unitResultUnknown={unitResultUnknown} />
      {!confirmApply && applyError && <Banner tone="error" title="Could not apply selected changes">{applyError}</Banner>}
      {closeError && <Banner tone="error" title="Could not close proposal">{closeError}</Banner>}
    </div>
    <Dialog actions={<><Button disabled={applying} onClick={() => { if (!applying) setConfirmApply(false); }} size="lg" variant="secondary">Cancel</Button><Button aria-label={applying ? undefined : `Apply ${selectedChangeIds.length} selected changes`} loading={applying} loadingLabel="Applying selected changes" onClick={apply} size="lg">{applying ? "Applying…" : `Apply ${selectedChangeIds.length} changes`}</Button></>} busy={applying} onClose={() => { if (!applying) setConfirmApply(false); }} open={confirmApply} title={`Apply ${selectedChangeIds.length} selected changes?`}>
      <div className={styles.applyDialogBody}>
        <p>These changes will create a new immutable revision.</p>
        {wholeDocumentReplacement ? <p>This replaces the entire current document. Individual units from the current revision will not be preserved.</p> : <p>Unselected units in the current revision will be kept.</p>}
        <p>Other proposal changes will remain unapplied.</p>
        <ul>{effectiveChanges.filter((change) => selectedChangeIds.includes(change.id)).map((change) => <li key={change.id}>{changeDisplayName(change)}</li>)}</ul>
        {removalCount > 0 && <p>{removalWarning(removalCount)}</p>}
        <p>{wholeDocumentReplacement ? "This creates one new revision by replacing the complete document." : "This creates one new revision with the selected changes."}</p>
        {applyError && <Banner action={applyRetryAllowed ? <Button disabled={applying} onClick={() => { void apply(); }} size="sm" variant="secondary">Retry application</Button> : undefined} tone="error" title="Could not apply selected changes">{applyError} Your selection has been preserved.</Banner>}
      </div>
    </Dialog>
  </div>;
}
