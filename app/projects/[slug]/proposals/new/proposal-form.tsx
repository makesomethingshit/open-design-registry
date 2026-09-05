"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type SourceRevision = { id: string; number: number; title: string; projectTitle: string; projectSlug: string };
type RelatedIssue = { id: string; title: string };

export default function ProposalForm({ slug, baseRevision, sourceRevisions, relatedIssues, defaultSourceRevisionId }: { slug: string; baseRevision: { id: string; number: number; title: string }; sourceRevisions: SourceRevision[]; relatedIssues: RelatedIssue[]; defaultSourceRevisionId: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const whatChanged = String(form.get("whatChanged") ?? "").trim();
    const why = String(form.get("why") ?? "").trim();
    const response = await fetch(`/api/projects/${slug}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevisionId: baseRevision.id, sourceRevisionId: form.get("sourceRevisionId"), title: form.get("title"), body: `What changed:\n${whatChanged}\n\nWhy:\n${why}`, relatedIssueId: form.get("relatedIssueId") || null }) });
    setSubmitting(false);
    if (!response.ok) {
      setError((await response.json().catch(() => null))?.error ?? "Could not create proposal");
      return;
    }
    router.push(`/proposals/${(await response.json()).id}`);
  }
  return <form className="form proposal-form" onSubmit={submit}>
    <p className="proposal-fixed"><span>Into</span>{slug} · Revision {baseRevision.number}</p>
    <label>From <select name="sourceRevisionId" defaultValue={defaultSourceRevisionId} required>{sourceRevisions.map((revision) => <option value={revision.id} key={revision.id}>{revision.projectSlug} · Revision {revision.number} — {revision.title}</option>)}</select></label>
    <label>Title <span aria-hidden="true">*</span><input name="title" required minLength={1} maxLength={200} placeholder="Improve mobile header typography" /></label>
    <label>What changed? <span aria-hidden="true">*</span><textarea name="whatChanged" required maxLength={4900} /></label>
    <label>Why? <span aria-hidden="true">*</span><textarea name="why" required maxLength={4900} /></label>
    <label>Related issue <select name="relatedIssueId" defaultValue=""><option value="">None</option>{relatedIssues.map((issue) => <option value={issue.id} key={issue.id}>#{issue.title}</option>)}</select></label>
    <p className="whole-document-note"><strong>Whole-document only</strong> This proposal replaces the entire document.</p>
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => router.back()}>Cancel</button><button className="button" disabled={submitting}>{submitting ? "Creating…" : "Create proposal"}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
