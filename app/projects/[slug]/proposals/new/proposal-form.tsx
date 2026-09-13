"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BundleFile = { id: string; name: string; kind?: string; mimeType: string; size: number };
type SourceRevision = { id: string; number: number; title: string; projectTitle: string; projectSlug: string; files: BundleFile[] };
type RelatedIssue = { id: string; title: string };
type UnitAction = "MODIFY_UNIT" | "RENAME_UNIT" | "REMOVE_UNIT" | "ADD_UNIT";
export type ProposalDraftChange = { action: UnitAction; targetFileId?: string; sourceFileId?: string; newName?: string };
type DraftChange = ProposalDraftChange & { key: string };
const maxProposalChanges = 10;

function unitLabel(file: BundleFile) {
  const kind = file.kind ? `${file.kind.slice(0, 1).toUpperCase()}${file.kind.slice(1)}` : "Asset · legacy";
  return `${file.name} · ${kind} · ${file.id.slice(0, 8)}`;
}

function actionLabel(action: UnitAction) {
  return { MODIFY_UNIT: "Modify", RENAME_UNIT: "Rename", REMOVE_UNIT: "Remove", ADD_UNIT: "Add" }[action];
}

export default function ProposalForm({ slug, baseRevision, sourceRevisions, relatedIssues, defaultSourceRevisionId, defaultRelatedIssueId = "", initialChanges = [] }: { slug: string; baseRevision: { id: string; number: number; title: string; files: BundleFile[] }; sourceRevisions: SourceRevision[]; relatedIssues: RelatedIssue[]; defaultSourceRevisionId: string; defaultRelatedIssueId?: string; initialChanges?: ProposalDraftChange[] }) {
  const router = useRouter();
  const [sourceRevisionId, setSourceRevisionId] = useState(defaultSourceRevisionId);
  const [changes, setChanges] = useState<DraftChange[]>(() => initialChanges.map((change) => ({ ...change, key: crypto.randomUUID() })));
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sourceRevision = useMemo(() => sourceRevisions.find((revision) => revision.id === sourceRevisionId) ?? sourceRevisions[0], [sourceRevisionId, sourceRevisions]);
  const canChooseUnits = Boolean(baseRevision.files.length);
  const canUseSourceUnits = Boolean(sourceRevision?.files.length);
  const sourceOnlyFiles = useMemo(() => sourceRevision?.files.filter((file) => !baseRevision.files.some((target) => target.id === file.id)) ?? [], [baseRevision.files, sourceRevision]);

  function resetRequest() {
    setRequestId(crypto.randomUUID());
  }

  function selectSourceRevision(nextId: string) {
    if (nextId === sourceRevisionId) return;
    if (changes.length && !window.confirm("Changing From will clear the selected changes. Your text draft will be kept.")) return;
    setSourceRevisionId(nextId);
    setChanges([]);
    resetRequest();
  }

  function addChange() {
    if (!canChooseUnits || changes.length >= maxProposalChanges) return;
    setChanges((current) => [...current, { key: crypto.randomUUID(), action: canUseSourceUnits ? "MODIFY_UNIT" : "RENAME_UNIT", targetFileId: baseRevision.files[0]?.id, sourceFileId: canUseSourceUnits ? sourceRevision?.files[0]?.id : undefined, newName: canUseSourceUnits ? undefined : "" }]);
    resetRequest();
  }

  function updateChange(key: string, patch: Partial<DraftChange>) {
    setChanges((current) => current.map((change) => change.key === key ? { ...change, ...patch } : change));
    resetRequest();
  }

  function removeChange(key: string) {
    setChanges((current) => current.filter((change) => change.key !== key));
    resetRequest();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (canChooseUnits && !changes.length) {
      setError("Add at least one unit change to propose.");
      return;
    }
    if (canChooseUnits && changes.length > maxProposalChanges) {
      setError(`A proposal can include up to ${maxProposalChanges} changes.`);
      return;
    }
    const targetIds = changes.flatMap((change) => change.targetFileId ? [change.targetFileId] : []);
    const addedSources = changes.filter((change) => change.action === "ADD_UNIT").flatMap((change) => change.sourceFileId ? [change.sourceFileId] : []);
    if (new Set(targetIds).size !== targetIds.length || new Set(addedSources).size !== addedSources.length) {
      setError("This unit already has a change in this proposal.");
      return;
    }
    const payloadChanges = changes.map((change) => {
      if (change.action === "ADD_UNIT") return { action: change.action, sourceFileId: change.sourceFileId };
      if (change.action === "RENAME_UNIT") return { action: change.action, targetFileId: change.targetFileId, newName: change.newName };
      if (change.action === "REMOVE_UNIT") return { action: change.action, targetFileId: change.targetFileId };
      return { action: change.action, targetFileId: change.targetFileId, sourceFileId: change.sourceFileId };
    });
    if (payloadChanges.some((change) => Object.values(change).some((value) => !value))) {
      setError("Complete every unit change before creating the proposal.");
      return;
    }
    setError("");
    setSubmitting(true);
    const form = new FormData(formElement);
    const whatChanged = String(form.get("whatChanged") ?? "").trim();
    const why = String(form.get("why") ?? "").trim();
    try {
      const response = await fetch(`/api/projects/${slug}/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevisionId: baseRevision.id, sourceRevisionId, title: form.get("title"), body: `What changed:\n${whatChanged}\n\nWhy:\n${why}`, relatedIssueId: form.get("relatedIssueId") || null, requestId, ...(canChooseUnits ? { changes: payloadChanges } : {}) }) });
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
    <label>Related issue <select name="relatedIssueId" defaultValue={defaultRelatedIssueId}><option value="">None</option>{relatedIssues.map((issue) => <option value={issue.id} key={issue.id}>{issue.title}</option>)}</select></label>
    <section className="file-input-list" aria-labelledby="units-to-propose-heading">
      <div className="section-heading"><h2 id="units-to-propose-heading">Units to propose</h2>{canChooseUnits && <button type="button" className="button secondary" onClick={addChange} disabled={changes.length >= maxProposalChanges}>Add change</button>}</div>
      {!canChooseUnits ? <p className="empty-state">Whole-document only. This format does not expose independently changeable units.</p> : changes.map((change) => {
        const target = baseRevision.files.find((file) => file.id === change.targetFileId);
        const needsTarget = change.action !== "ADD_UNIT";
        return <article className="change-row file-input-row" key={change.key}>
          <label>Action <select value={change.action} onChange={(event) => updateChange(change.key, { action: event.target.value as UnitAction, targetFileId: event.target.value === "ADD_UNIT" ? undefined : change.targetFileId ?? baseRevision.files[0]?.id, sourceFileId: event.target.value === "RENAME_UNIT" || event.target.value === "REMOVE_UNIT" ? undefined : event.target.value === "ADD_UNIT" ? sourceOnlyFiles[0]?.id : change.sourceFileId ?? sourceRevision?.files[0]?.id, newName: event.target.value === "RENAME_UNIT" ? change.newName ?? "" : undefined })}><option value="MODIFY_UNIT" disabled={!canUseSourceUnits}>Modify</option><option value="RENAME_UNIT">Rename</option><option value="REMOVE_UNIT">Remove</option><option value="ADD_UNIT" disabled={!canUseSourceUnits}>Add</option></select></label>
          {needsTarget && <label>Target <select value={change.targetFileId ?? ""} onChange={(event) => updateChange(change.key, { targetFileId: event.target.value })}>{baseRevision.files.map((file) => <option value={file.id} key={file.id}>{unitLabel(file)}</option>)}</select></label>}
          {change.action === "MODIFY_UNIT" && <label>Replacement source <select value={change.sourceFileId ?? ""} onChange={(event) => updateChange(change.key, { sourceFileId: event.target.value })}>{sourceRevision?.files.map((file) => <option value={file.id} key={file.id}>{unitLabel(file)}</option>)}</select></label>}
          {change.action === "ADD_UNIT" && <label>Source unit <select value={change.sourceFileId ?? ""} onChange={(event) => updateChange(change.key, { sourceFileId: event.target.value })}><option value="">Choose source unit</option>{sourceOnlyFiles.map((file) => <option value={file.id} key={file.id}>{unitLabel(file)}</option>)}</select>{sourceOnlyFiles.length === 0 && <span className="meta">Publish a new source unit before adding one.</span>}</label>}
          {change.action === "RENAME_UNIT" && <label>New name <input required maxLength={200} value={change.newName ?? ""} aria-describedby={`${change.key}-rename-help`} onChange={(event) => updateChange(change.key, { newName: event.target.value })} /><span className="meta" id={`${change.key}-rename-help`}>Current name: {target?.name}. Same ID and source content will be kept.</span></label>}
          {change.action === "REMOVE_UNIT" && <p className="meta">This unit will be absent from the new revision. Earlier revisions remain available.</p>}
          <button type="button" className="button secondary" onClick={() => removeChange(change.key)}>Discard change</button>
        </article>;
      })}
      {canChooseUnits && !canUseSourceUnits && <p className="meta">This From revision has no file bundle, so rename and remove changes are available.</p>}
      {canChooseUnits && !changes.length && <p className="empty-state">Add a change to begin. A unit can appear only once in a proposal.</p>}
      {changes.length > maxProposalChanges && <p className="error" role="alert">A proposal can include up to {maxProposalChanges} changes. Remove a change before creating the proposal.</p>}
      {changes.length > 0 && <p className="meta">Summary: {changes.map((change) => actionLabel(change.action).toLowerCase()).join(" · ")}</p>}
    </section>
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => router.back()}>Cancel</button><button className="button" disabled={submitting || (canChooseUnits && !changes.length)}>{submitting ? "Creating…" : "Create proposal"}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
