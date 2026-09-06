"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RevisionDiff from "@/app/projects/[slug]/revision-diff";

type Preview = { id: string; position: number; url: string; mimeType: string; altText: string };
type Revision = { id: string; number: number; title: string; previews: Preview[] };
type Change = {
  id: string; type: string; action: string; target: string; targetFileId: string | null; name: string | null; newName: string | null; kind: string | null; mimeType: string | null; size: number | null;
  reviewStatus: "PENDING" | "APPROVED" | "CHANGES_REQUESTED"; reviewComment: string | null; reviewedBy: { name: string } | null;
  appliedRevision: { id: string; number: number; title: string } | null;
  latestAvailable: boolean; latestName: string | null;
  reviewHistory: Array<{ id: string; status: string; comment: string | null; createdAt: Date; author: { name: string } }>;
  sourcePreviews: Preview[]; basePreviews: Preview[]; latestPreviews: Preview[];
};
type Comment = { id: string; body: string; author: { name: string }; createdAt: Date };

function fileSize(size: number | null) {
  if (size == null) return "";
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
}

function kindLabel(kind: string | null) {
  return kind ? `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}` : "Asset · legacy";
}

function changeSummary(change: Change) {
  const name = change.name ?? change.target;
  if (change.action === "RENAME_UNIT") return `Rename ${name} to ${change.newName ?? "new name"}`;
  if (change.action === "ADD_UNIT") return `Add ${name}`;
  if (change.action === "REMOVE_UNIT") return `Remove ${name}`;
  if (change.action === "MODIFY_UNIT") return `Modify ${name}`;
  return change.type === "REPLACE_DOCUMENT" ? "Whole document" : name;
}

export default function ProposalReview({ proposalId, projectSlug, baseRevision, sourceRevision, latestRevision, stale, status, changes, comments, signedIn, isOwner, canClose }: { proposalId: string; projectSlug: string; baseRevision: Revision; sourceRevision: Revision; latestRevision: Revision | null; stale: boolean; status: string; changes: Change[]; comments: Comment[]; signedIn: boolean; isOwner: boolean; canClose: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [requestingChangeId, setRequestingChangeId] = useState<string | null>(null);
  const [previewChangeId, setPreviewChangeId] = useState(changes[0]?.id ?? "");
  const [reviewingLatest, setReviewingLatest] = useState(false);
  const [confirmedLatest, setConfirmedLatest] = useState(false);
  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approvedChanges = useMemo(() => changes.filter((change) => change.reviewStatus === "APPROVED" && !change.appliedRevision), [changes]);
  const applicableApprovedChanges = useMemo(() => approvedChanges.filter((change) => !stale || change.latestAvailable), [approvedChanges, stale]);
  const selectedPreview = changes.find((change) => change.id === previewChangeId) ?? changes[0];
  const applied = changes.filter((change) => change.appliedRevision).length;
  const requested = changes.filter((change) => !change.appliedRevision && change.reviewStatus === "CHANGES_REQUESTED").length;
  const pending = changes.filter((change) => !change.appliedRevision && change.reviewStatus === "PENDING").length;
  const canApply = isOwner && status !== "CLOSED" && status !== "ACCEPTED" && applicableApprovedChanges.length > 0;
  useEffect(() => {
    setSelectedChangeIds((ids) => ids.filter((id) => applicableApprovedChanges.some((change) => change.id === id)));
  }, [applicableApprovedChanges]);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedChangeIds.length > 0 && selectedChangeIds.length < applicableApprovedChanges.length;
    setConfirmedLatest(false);
  }, [applicableApprovedChanges.length, selectedChangeIds]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmApply && !dialog.open) dialog.showModal();
    if (!confirmApply && dialog.open) dialog.close();
  }, [confirmApply]);
  function displayName(change: Change) {
    return changeSummary(change);
  }
  function toggleSelection(changeId: string, checked: boolean) {
    setSelectedChangeIds((ids) => checked ? [...ids, changeId] : ids.filter((id) => id !== changeId));
  }
  async function review(changeId: string, reviewStatus: "APPROVED" | "CHANGES_REQUESTED", comment = "") {
    setError("");
    const response = await fetch(`/api/proposals/${proposalId}/changes/${changeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: reviewStatus, comment }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not save review"); return; }
    setRequestingChangeId(null);
    router.refresh();
  }
  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/proposals/${proposalId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: form.get("body") }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not add comment"); return; }
    formElement.reset();
    router.refresh();
  }
  async function apply() {
    setApplying(true);
    setError("");
    const response = await fetch(`/api/proposals/${proposalId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changeIds: selectedChangeIds, ...(stale && confirmedLatest && latestRevision ? { reviewedLatestRevisionId: latestRevision.id, reviewedChangeIds: selectedChangeIds } : {}) }) });
    setApplying(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "Could not apply selected changes");
      if (payload?.latestRevision) { setConfirmedLatest(false); setReviewingLatest(false); }
      return;
    }
    setConfirmApply(false);
    setSelectedChangeIds([]);
    router.refresh();
  }
  async function close() {
    const response = await fetch(`/api/proposals/${proposalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not close proposal"); return; }
    router.refresh();
  }
  const comparisonPrevious = reviewingLatest && selectedPreview ? selectedPreview.latestPreviews : selectedPreview?.basePreviews ?? baseRevision.previews;
  const comparisonCurrent = selectedPreview?.sourcePreviews ?? sourceRevision.previews;
  return <>
    {stale && <section className="stale-banner" role="status"><strong>This proposal is based on <a href={`/projects/${projectSlug}/revisions/${baseRevision.number}`}>Revision {baseRevision.number}</a>. The project is currently at <a href={`/projects/${projectSlug}/revisions/${latestRevision?.number}`}>Revision {latestRevision?.number}</a>.</strong><p>Review the latest revision against the selected changes before applying.</p>{!reviewingLatest ? <button type="button" className="button secondary" onClick={() => { setReviewingLatest(true); setConfirmedLatest(false); }}>Review latest revision</button> : <><button type="button" className="button secondary" onClick={() => { setReviewingLatest(false); setConfirmedLatest(false); }}>Back to base comparison</button><label className="stale-confirm"><input type="checkbox" checked={confirmedLatest} onChange={(event) => setConfirmedLatest(event.target.checked)} /> I reviewed Revision {latestRevision?.number} against the selected changes and understand the listed additions, modifications, removals, and renames will be applied in a new revision.</label></>}</section>}
    <section id="visual-review" className="repo-panel" aria-labelledby="visual-review-heading"><div className="section-heading"><h2 id="visual-review-heading">Visual Review</h2>{changes.length > 1 && <label>Unit <select value={selectedPreview?.id ?? ""} onChange={(event) => setPreviewChangeId(event.target.value)}>{changes.map((change) => <option value={change.id} key={change.id}>{displayName(change)}</option>)}</select></label>}</div>{selectedPreview?.action === "RENAME_UNIT" ? <div className="empty-state"><p>{reviewingLatest ? "Latest name" : "Original name"}: <strong>{(reviewingLatest ? selectedPreview.latestName : selectedPreview.name) ?? selectedPreview.target}</strong> → Proposed name: <strong>{selectedPreview.newName}</strong></p><p>Name only; source content is unchanged.</p></div> : selectedPreview?.action === "ADD_UNIT" ? <><p className="empty-state">Not present in the base revision.</p><RevisionDiff current={comparisonCurrent} previous={[]} currentNumber={sourceRevision.number} currentLabel="Proposal" previousLabel="Original" comparisonMode="side-by-side" /></> : selectedPreview?.action === "REMOVE_UNIT" ? <><RevisionDiff current={[]} previous={comparisonPrevious} currentNumber={sourceRevision.number} previousNumber={reviewingLatest ? latestRevision?.number : baseRevision.number} currentLabel="Proposal" previousLabel={reviewingLatest ? "Latest project" : "Original"} comparisonMode="side-by-side" /><p className="empty-state">Removed in this proposal.</p></> : comparisonCurrent.length || comparisonPrevious.length ? <RevisionDiff current={comparisonCurrent} previous={comparisonPrevious} currentNumber={sourceRevision.number} previousNumber={reviewingLatest ? latestRevision?.number : baseRevision.number} currentLabel="Proposal" previousLabel={reviewingLatest ? "Latest project" : "Original"} comparisonMode="side-by-side" /> : <p className="empty-state">No preview available for {selectedPreview ? displayName(selectedPreview) : "this unit"}.</p>}</section>
    <section className="repo-panel" aria-labelledby="changes-heading"><div className="section-heading"><h2 id="changes-heading">Changes</h2><span className="section-count">{changes.length}</span></div>{changes.map((change) => {
      const canReview = isOwner && !change.appliedRevision && status !== "CLOSED" && status !== "ACCEPTED";
      const canSelect = canApply && change.reviewStatus === "APPROVED" && !change.appliedRevision && (!stale || change.latestAvailable);
      const selected = selectedChangeIds.includes(change.id);
      return <article className="change-row" key={change.id}><div className="change-main"><div className="change-file-heading">{canApply && <label><input type="checkbox" checked={selected} disabled={!canSelect} onChange={(event) => toggleSelection(change.id, event.target.checked)} aria-label={`Select ${displayName(change)}`} /></label>}<button type="button" className="link-button" onClick={() => setPreviewChangeId(change.id)}>{displayName(change)}</button><span className="meta">{kindLabel(change.kind)}</span></div>{change.action === "RENAME_UNIT" && <p className="meta">Same unit · name only</p>}{change.action === "REMOVE_UNIT" && <p className="meta">{kindLabel(change.kind)} · removed from the next revision</p>}{change.action === "ADD_UNIT" && <p className="meta">{kindLabel(change.kind)}{change.mimeType ? ` · ${change.mimeType} · ${fileSize(change.size)}` : ""}</p>}{(change.action === "MODIFY_UNIT" || change.type === "REPLACE_ASSET") && change.mimeType && <p className="meta">{change.mimeType} · {fileSize(change.size)} · source replacement</p>}{stale && !change.latestAvailable && <p className="error">This unit is no longer available in the latest revision.</p>}{change.reviewComment && <p className="review-comment">{change.reviewComment}</p>}{change.appliedRevision && <p className="success-note">Applied as <a href={`/projects/${projectSlug}/revisions/${change.appliedRevision.number}`}>Revision {change.appliedRevision.number}</a>.</p>}{change.reviewHistory.length > 0 && <div className="review-history">{change.reviewHistory.map((review) => <p className="meta" key={review.id}>{review.author.name} · {review.status.replaceAll("_", " ")}{review.comment ? ` — ${review.comment}` : ""}</p>)}</div>}</div><span className={`proposal-status ${change.appliedRevision ? "accepted" : change.reviewStatus.toLowerCase()}`}>{change.appliedRevision ? "Applied" : change.reviewStatus.replaceAll("_", " ")}</span>{canReview && <div className="change-actions"><button type="button" className="button secondary" onClick={() => review(change.id, "APPROVED")}>Approve change</button><button type="button" className="button secondary" onClick={() => setRequestingChangeId((current) => current === change.id ? null : change.id)}>Request changes</button>{requestingChangeId === change.id && <form className="review-form" onSubmit={(event) => { event.preventDefault(); review(change.id, "CHANGES_REQUESTED", String(new FormData(event.currentTarget).get("comment") ?? "")); }}><label>Review comment<textarea name="comment" required maxLength={10000} /></label><button className="button">Send request</button></form>}</div>}</article>;
    })}</section>
    <section className="repo-panel" aria-labelledby="conversation-heading"><div className="section-heading"><h2 id="conversation-heading">Conversation</h2></div>{comments.length ? <div className="proposal-comments">{comments.map((item) => <article className="issue-comment" key={item.id}><p>{item.body}</p><span className="meta">{item.author.name} · {new Date(item.createdAt).toLocaleString()}</span></article>)}</div> : <p className="empty-state">Start the conversation.</p>}{signedIn && status !== "CLOSED" && <form className="inline-form" onSubmit={comment}><input name="body" required maxLength={10000} placeholder="Write a comment" aria-label="Write a proposal comment" /><button className="button secondary">Comment</button></form>}</section>
    <section className="repo-panel review-state" aria-labelledby="review-state-heading"><div className="section-heading"><h2 id="review-state-heading">Review state</h2></div><p>{pending} pending / {approvedChanges.length} approved / {requested} changes requested{applied ? ` / ${applied} applied` : ""}</p>{canApply && <div className="apply-actions"><label><input ref={selectAllRef} type="checkbox" checked={applicableApprovedChanges.length > 0 && selectedChangeIds.length === applicableApprovedChanges.length} onChange={(event) => setSelectedChangeIds(event.target.checked ? applicableApprovedChanges.map((change) => change.id) : [])} /> Select all approved</label><button ref={applyButtonRef} type="button" className="button" disabled={!selectedChangeIds.length || (stale && !confirmedLatest)} onClick={() => setConfirmApply(true)}>Apply {selectedChangeIds.length} of {approvedChanges.length} approved changes</button>{!selectedChangeIds.length && <span className="meta">Select approved changes to apply.</span>}{stale && !confirmedLatest && <span className="meta">Review and confirm the latest revision first.</span>}</div>}{canClose && status !== "CLOSED" && status !== "ACCEPTED" && <button type="button" className="button secondary" onClick={close}>Close proposal</button>}</section>
    <dialog ref={dialogRef} className="apply-confirmation" aria-labelledby="apply-confirmation-title" onClose={() => { setConfirmApply(false); applyButtonRef.current?.focus(); }}><h3 id="apply-confirmation-title">Apply {selectedChangeIds.length} approved changes?</h3><p>Unselected units in the current revision will be kept.</p><ul>{changes.filter((change) => selectedChangeIds.includes(change.id)).map((change) => <li key={change.id}>{displayName(change)}</li>)}</ul>{changes.some((change) => selectedChangeIds.includes(change.id) && change.action === "REMOVE_UNIT") && <p className="meta">{changes.filter((change) => selectedChangeIds.includes(change.id) && change.action === "REMOVE_UNIT").length} unit will be removed from the new revision. Earlier revisions remain available.</p>}<p className="meta">This creates one new revision with the selected changes.</p><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setConfirmApply(false)}>Cancel</button><button type="button" className="button" disabled={applying} onClick={apply}>{applying ? "Applying…" : `Apply ${selectedChangeIds.length} changes`}</button></div></dialog>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
