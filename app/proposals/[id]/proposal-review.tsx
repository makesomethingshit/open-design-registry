"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import RevisionDiff from "@/app/projects/[slug]/revision-diff";

type Preview = { id: string; position: number; url: string; mimeType: string; altText: string };
type Revision = { id: string; number: number; title: string; previews: Preview[] };
type Change = { id: string; reviewStatus: "PENDING" | "APPROVED" | "CHANGES_REQUESTED"; reviewComment: string | null; reviewedBy: { name: string } | null };
type Comment = { id: string; body: string; author: { name: string }; createdAt: Date };

export default function ProposalReview({ proposalId, baseRevision, sourceRevision, latestRevision, stale, status, changes, comments, signedIn, isOwner, canClose }: { proposalId: string; baseRevision: Revision; sourceRevision: Revision; latestRevision: Revision | null; stale: boolean; status: string; changes: Change[]; comments: Comment[]; signedIn: boolean; isOwner: boolean; canClose: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [reviewingLatest, setReviewingLatest] = useState(false);
  const [confirmedLatest, setConfirmedLatest] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const selectedBase = reviewingLatest && latestRevision ? latestRevision : baseRevision;
  const approved = changes.filter((change) => change.reviewStatus === "APPROVED").length;
  const requested = changes.filter((change) => change.reviewStatus === "CHANGES_REQUESTED").length;
  async function review(changeId: string, reviewStatus: "APPROVED" | "CHANGES_REQUESTED", comment = "") {
    setError("");
    const response = await fetch(`/api/proposals/${proposalId}/changes/${changeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: reviewStatus, comment }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not save review"); return; }
    setRequesting(false);
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
    const response = await fetch(`/api/proposals/${proposalId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(stale && confirmedLatest && latestRevision ? { reviewedLatestRevisionId: latestRevision.id } : {}) }) });
    setApplying(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "Could not apply proposal");
      if (payload?.latestRevision) { setConfirmedLatest(false); setReviewingLatest(false); }
      return;
    }
    setConfirmApply(false);
    router.refresh();
  }
  async function close() {
    const response = await fetch(`/api/proposals/${proposalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not close proposal"); return; }
    router.refresh();
  }
  return <>
    {stale && <section className="stale-banner" role="status"><strong>This proposal is based on Revision {baseRevision.number}. The project is currently at Revision {latestRevision?.number}.</strong><p>Review the latest revision before applying this whole-document change.</p>{!reviewingLatest ? <button type="button" className="button secondary" onClick={() => { setReviewingLatest(true); setConfirmedLatest(false); }}>Review latest revision</button> : <><button type="button" className="button secondary" onClick={() => { setReviewingLatest(false); setConfirmedLatest(false); }}>Back to base comparison</button><label className="stale-confirm"><input type="checkbox" checked={confirmedLatest} onChange={(event) => setConfirmedLatest(event.target.checked)} /> I reviewed Revision {latestRevision?.number} against this proposal and understand the entire document will be replaced.</label></>}</section>}
    <section id="visual-review" className="repo-panel" aria-labelledby="visual-review-heading"><div className="section-heading"><h2 id="visual-review-heading">Visual Review</h2><span className="meta">Original ↔ Proposal</span></div><RevisionDiff current={sourceRevision.previews} previous={selectedBase.previews} currentNumber={sourceRevision.number} previousNumber={selectedBase.number} currentLabel="Proposal" previousLabel={reviewingLatest ? "Latest project" : "Original"} comparisonMode="side-by-side" /></section>
    <section className="repo-panel" aria-labelledby="changes-heading"><div className="section-heading"><h2 id="changes-heading">Changes</h2><span className="section-count">{changes.length}</span></div>{changes.map((change) => <article className="change-row" key={change.id}><div><strong>Whole document</strong><p className="meta">Replace document · Source R{sourceRevision.number} · Base R{baseRevision.number}</p>{change.reviewComment && <p className="review-comment">{change.reviewComment}</p>}</div><span className={`proposal-status ${change.reviewStatus.toLowerCase()}`}>{change.reviewStatus.replaceAll("_", " ")}</span>{isOwner && status !== "ACCEPTED" && status !== "CLOSED" && <div className="change-actions"><button type="button" className="button secondary" onClick={() => review(change.id, "APPROVED")}>Approve change</button><button type="button" className="button secondary" onClick={() => setRequesting((value) => !value)}>Request changes</button>{requesting && <form className="review-form" onSubmit={(event) => { event.preventDefault(); review(change.id, "CHANGES_REQUESTED", String(new FormData(event.currentTarget).get("comment") ?? "")); }}><label>Review comment<textarea name="comment" required maxLength={10000} /></label><button className="button">Send request</button></form>}</div>}</article>)}</section>
    <section className="repo-panel" aria-labelledby="conversation-heading"><div className="section-heading"><h2 id="conversation-heading">Conversation</h2></div>{comments.length ? <div className="proposal-comments">{comments.map((item) => <article className="issue-comment" key={item.id}><p>{item.body}</p><span className="meta">{item.author.name} · {new Date(item.createdAt).toLocaleString()}</span></article>)}</div> : <p className="empty-state">Start the conversation.</p>}{signedIn && status !== "CLOSED" && <form className="inline-form" onSubmit={comment}><input name="body" required maxLength={10000} placeholder="Write a comment" aria-label="Write a proposal comment" /><button className="button secondary">Comment</button></form>}</section>
    <section className="repo-panel review-state" aria-labelledby="review-state-heading"><div className="section-heading"><h2 id="review-state-heading">Review state</h2></div><p>{changes.length - approved - requested} pending / {approved} approved / {requested} changes requested</p>{isOwner && status === "APPROVED" && <div className="apply-actions"><button type="button" className="button" disabled={stale && !confirmedLatest} onClick={() => setConfirmApply(true)}>Apply approved changes</button>{stale && !confirmedLatest && <span className="meta">Review and confirm the latest revision first.</span>}</div>}{confirmApply && <div className="apply-confirmation" role="dialog" aria-modal="true" aria-labelledby="apply-confirmation-title"><h3 id="apply-confirmation-title">Apply 1 approved change?</h3><p>The entire document will be replaced in a new revision. Existing revisions stay unchanged.</p><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setConfirmApply(false)}>Cancel</button><button type="button" className="button" disabled={applying} onClick={apply}>{applying ? "Applying…" : "Apply approved changes"}</button></div></div>}{canClose && status !== "CLOSED" && status !== "ACCEPTED" && <button type="button" className="button secondary" onClick={close}>Close proposal</button>}</section>
    {error && <p className="error" role="alert">{error}</p>}
  </>;
}
