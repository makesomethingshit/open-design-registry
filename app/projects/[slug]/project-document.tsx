"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { renderProjectDocument } from "@/src/lib/project-document";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { ProjectDocumentEditor } from "@/src/components/ui/project-document-editor";
import editorStyles from "@/src/components/ui/project-document-editor.module.css";
import styles from "./project.module.css";

export default function ProjectDocument({
  document,
  isOwner,
  hasRevision,
  slug,
}: {
  document: string;
  isOwner: boolean;
  hasRevision: boolean;
  slug: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(document);
  const [draft, setDraft] = useState(document);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editor = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = saved.trim();
  useEffect(() => { setSaved(document); if (!editing) setDraft(document); }, [document]);
  useEffect(() => { if (editing) editor.current?.querySelector("textarea")?.focus(); }, [editing]);
  function edit() { setDraft(saved); setEditing(true); setMessage(""); setError(""); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || editorBusy) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ document: draft }) });
      if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not save the document."); return; }
      setSaved(draft); setEditing(false); setMessage("Project document saved."); router.refresh(); heading.current?.focus();
    } catch { setError("Could not save the document. Try again."); }
    finally { setSaving(false); }
  }
  return (
    <section aria-labelledby="project-document-heading" className={`${styles.section} ${styles.projectDocument}`} id="project-document">
      <header className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Project guide</p>
          <h2 id="project-document-heading" ref={heading} tabIndex={-1}>Project document</h2>
        </div>
        {isOwner && !editing && body && (
          <Button onClick={edit} size="sm" variant="secondary">
            Edit document
          </Button>
        )}
      </header>
      {message && <p role="status" className={styles.muted}>{message}</p>}
      {editing ? <form aria-label="Edit project document" aria-busy={saving} onSubmit={save} ref={editor} className={styles.documentForm}>
        <Field id="settings-document" label="Project document (Markdown)"><ProjectDocumentEditor disabled={saving} name="document" onBusyChange={setEditorBusy} onChange={setDraft} slug={slug} value={draft} /></Field>
        {error && <p role="alert">{error}</p>}
        {editorBusy && <p role="status" className={styles.muted}>Finish the table or wait for the image upload before saving.</p>}
        <div className={styles.editActions}><Button disabled={saving || editorBusy} onClick={() => { setEditing(false); setError(""); heading.current?.focus(); }} variant="secondary">Cancel document changes</Button><Button disabled={editorBusy} loading={saving} type="submit">Save document</Button></div>
      </form> : body ? (
        <div
          className={`${styles.prose} ${editorStyles.prose}`}
          // ponytail: rendered HTML is fully escaped + allowlisted by renderProjectDocument (no raw HTML passthrough).
          dangerouslySetInnerHTML={{ __html: renderProjectDocument(body) }}
        />
      ) : (
        <p className={styles.muted}>
          No project document has been added yet.
          {isOwner ? (
            <>
              {" "}Share the project's goals, design principles and ways to contribute.{" "}
              <Button onClick={edit} size="sm" variant="secondary">Add document</Button>
            </>
          ) : hasRevision ? (
            <> Read About for a short summary and browse <a href="#revisions">Revisions</a> for the current design.</>
          ) : (
            <> Read About for a short summary. A revision has not been published yet.</>
          )}
        </p>
      )}
    </section>
  );
}
