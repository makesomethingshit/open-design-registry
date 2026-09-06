"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type ExistingFile = { id: string; name: string; kind?: string };

function kindLabel(kind?: string) {
  return kind ? `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}` : "Asset · legacy";
}

export default function RevisionPublishForm({ slug, existingFiles }: { slug: string; existingFiles: ExistingFile[] }) {
  const router = useRouter();
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [sourceFileIds, setSourceFileIds] = useState<string[]>([]);
  const [sourceKinds, setSourceKinds] = useState<string[]>([]);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function selectSources(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setSourceFiles(files);
    setSourceFileIds(files.map(() => ""));
    setSourceKinds(files.map(() => ""));
  }

  function selectExisting(index: number, id: string) {
    const existing = existingFiles.find((file) => file.id === id);
    setSourceFileIds((current) => current.map((value, currentIndex) => currentIndex === index ? id : value));
    setSourceKinds((current) => current.map((value, currentIndex) => currentIndex === index ? existing?.kind ?? "" : value));
  }

  function selectPreviews(event: ChangeEvent<HTMLInputElement>) {
    setPreviewFiles(Array.from(event.target.files ?? []));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/revisions`, { method: "POST", body: new FormData(formElement) });
      const payload = await response.json().catch(() => null) as { error?: string; number?: number } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Revision could not be published");
        return;
      }
      if (typeof payload?.number !== "number") {
        setError("Revision could not be published");
        return;
      }
      router.push(`/projects/${slug}/revisions/${payload.number}`);
    } catch {
      setError("Revision could not be published");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form revision-publish-form" onSubmit={submit} aria-busy={submitting}>
    <h2>Publish a revision</h2>
    <label>Revision title<input name="title" required maxLength={120} /></label>
    <label>Change description<textarea name="changeDescription" required minLength={1} maxLength={500} /></label>
    <label>Design tool<input name="tool" maxLength={80} placeholder="Figma, Penpot, or Photoshop" /></label>
    <label>Tool version<input name="toolVersion" maxLength={80} placeholder="Optional" /></label>
    <label>Tags<input name="tags" maxLength={800} placeholder="ui, landing-page, mobile" /></label>
    <label>Source files (up to 10 original files)<input name="sources" type="file" multiple onChange={selectSources} /></label>
    <p className="meta">Use a source URL instead when no files are uploaded. ZIP contents are kept as one file.</p>
    <label>Source URL<input name="sourceUrl" type="url" placeholder="https://example.com/design.zip" /></label>
    <label>Source SHA-256 checksum<input name="sourceChecksum" inputMode="text" pattern="[a-fA-F0-9]{64}" maxLength={64} placeholder="Optional for one uploaded file" /></label>
    <label>Previews (PNG/JPG/HTML, up to 10)<input name="previews" type="file" accept="image/png,image/jpeg,text/html" multiple required onChange={selectPreviews} /></label>
    {previewFiles.map((file, index) => <label key={`${file.name}-${index}`}>Alt text for {file.name}<input name="altTexts" required maxLength={500} /></label>)}
    {sourceFiles.map((file, index) => {
      const existing = existingFiles.find((candidate) => candidate.id === sourceFileIds[index]);
      return <section className="file-input-list" key={`${file.name}-${index}`}><h3>{file.name}</h3><label>Unit identity<select name="sourceFileIds" value={sourceFileIds[index] ?? ""} onChange={(event) => selectExisting(index, event.target.value)}><option value="">New unit</option>{existingFiles.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name} · {kindLabel(candidate.kind)}</option>)}</select></label>{existing?.kind ? <><input type="hidden" name="sourceKinds" value={existing.kind} /><p className="meta">Kind: {kindLabel(existing.kind)} · preserved for this existing unit.</p></> : <label>Kind<select name="sourceKinds" value={sourceKinds[index] ?? ""} onChange={(event) => setSourceKinds((current) => current.map((value, currentIndex) => currentIndex === index ? event.target.value : value))} required><option value="">Choose kind</option><option value="artboard">Artboard</option><option value="component">Component</option><option value="asset">Asset</option><option value="token">Token</option></select></label>}<p className="meta">Choose what this file represents. ODR does not inspect layers or extract units automatically.</p>{previewFiles.length > 0 && <label>Preview for {file.name}<select name="sourcePreviewIndexes" defaultValue={Math.min(index, previewFiles.length - 1)} required>{previewFiles.map((preview, previewIndex) => <option value={previewIndex} key={`${preview.name}-${previewIndex}`}>{preview.name}</option>)}</select></label>}</section>;
    })}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" disabled={submitting}>{submitting ? "Publishing…" : "Publish revision"}</button>
  </form>;
}
