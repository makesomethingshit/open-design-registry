"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BundleFile = { id: string; name: string; mimeType: string; size: number };
type SourceRevision = { id: string; number: number; title: string; projectTitle: string; projectSlug: string; files: BundleFile[] };
type RelatedIssue = { id: string; title: string };
type SelectedFile = { sourceFileId: string; targetFileId: string };

function fileSize(size: number) {
  return new Intl.NumberFormat("en", { style: "unit", unit: "byte", notation: "compact", maximumFractionDigits: 1 }).format(size);
}

export default function ProposalForm({ slug, baseRevision, sourceRevisions, relatedIssues, defaultSourceRevisionId }: { slug: string; baseRevision: { id: string; number: number; title: string; files: BundleFile[] }; sourceRevisions: SourceRevision[]; relatedIssues: RelatedIssue[]; defaultSourceRevisionId: string }) {
  const router = useRouter();
  const [sourceRevisionId, setSourceRevisionId] = useState(defaultSourceRevisionId);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sourceRevision = useMemo(() => sourceRevisions.find((revision) => revision.id === sourceRevisionId) ?? sourceRevisions[0], [sourceRevisionId, sourceRevisions]);
  const canChooseFiles = Boolean(baseRevision.files.length && sourceRevision?.files.length);

  function selectSourceRevision(nextId: string) {
    if (nextId === sourceRevisionId) return;
    if (selectedFiles.length && !window.confirm("Changing From will clear the selected files. Your text draft will be kept.")) return;
    setSourceRevisionId(nextId);
    setSelectedFiles([]);
  }

  function toggleFile(sourceFileId: string, checked: boolean) {
    setSelectedFiles((current) => {
      if (!checked) return current.filter((file) => file.sourceFileId !== sourceFileId);
      const firstTarget = baseRevision.files.find((target) => !current.some((file) => file.targetFileId === target.id));
      return firstTarget ? [...current, { sourceFileId, targetFileId: firstTarget.id }] : current;
    });
  }

  function setTarget(sourceFileId: string, targetFileId: string) {
    setSelectedFiles((current) => current.map((file) => file.sourceFileId === sourceFileId ? { ...file, targetFileId } : file));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (canChooseFiles && !selectedFiles.length) {
      setError("Select at least one file to propose.");
      return;
    }
    setError("");
    setSubmitting(true);
    const form = new FormData(formElement);
    const whatChanged = String(form.get("whatChanged") ?? "").trim();
    const why = String(form.get("why") ?? "").trim();
    try {
      const response = await fetch(`/api/projects/${slug}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevisionId: baseRevision.id, sourceRevisionId, title: form.get("title"), body: `What changed:\n${whatChanged}\n\nWhy:\n${why}`, relatedIssueId: form.get("relatedIssueId") || null, ...(canChooseFiles ? { files: selectedFiles } : {}) }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "Could not create proposal");
        return;
      }
      router.push(`/proposals/${(await response.json()).id}`);
    } catch {
      setError("Could not create proposal");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form proposal-form" onSubmit={submit} aria-busy={submitting}>
    <p className="proposal-fixed"><span>Into</span>{slug} · Revision {baseRevision.number}</p>
    <label>From <select name="sourceRevisionId" value={sourceRevisionId} onChange={(event) => selectSourceRevision(event.target.value)} required>{sourceRevisions.map((revision) => <option value={revision.id} key={revision.id}>{revision.projectSlug} · Revision {revision.number} — {revision.title}</option>)}</select></label>
    <label>Title <span aria-hidden="true">*</span><input name="title" required minLength={1} maxLength={200} placeholder="Improve mobile header typography" /></label>
    <label>What changed? <span aria-hidden="true">*</span><textarea name="whatChanged" required maxLength={4900} /></label>
    <label>Why? <span aria-hidden="true">*</span><textarea name="why" required maxLength={4900} /></label>
    <label>Related issue <select name="relatedIssueId" defaultValue=""><option value="">None</option>{relatedIssues.map((issue) => <option value={issue.id} key={issue.id}>{issue.title}</option>)}</select></label>
    <section className="file-input-list" aria-labelledby="files-to-propose-heading">
      <div className="section-heading"><h2 id="files-to-propose-heading">Files to propose</h2>{sourceRevision && <span className="meta">Choose files from Revision {sourceRevision.number}</span>}</div>
      {!canChooseFiles ? <p className="empty-state">Whole-document only. This format does not expose independently replaceable files.</p> : sourceRevision.files.map((file) => {
        const selected = selectedFiles.find((item) => item.sourceFileId === file.id);
        return <article className="change-row file-input-row" key={file.id}><label><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleFile(file.id, event.target.checked)} aria-label={`Select ${file.name}`} /><strong>{file.name}</strong><span className="meta">{file.mimeType} · {fileSize(file.size)}</span></label>{selected && <label>Replace <select value={selected.targetFileId} onChange={(event) => setTarget(file.id, event.target.value)}>{baseRevision.files.map((target) => <option value={target.id} key={target.id} disabled={target.id !== selected.targetFileId && selectedFiles.some((item) => item.targetFileId === target.id)}>{target.name}</option>)}</select></label>}</article>;
      })}
      {canChooseFiles && !selectedFiles.length && <p className="empty-state">Select files to propose.</p>}
    </section>
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => router.back()}>Cancel</button><button className="button" disabled={submitting || (canChooseFiles && !selectedFiles.length)}>{submitting ? "Creating…" : "Create proposal"}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
