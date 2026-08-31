"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RevisionPublishForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function selectPreviews(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files ?? []));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/revisions`, { method: "POST", body: new FormData(event.currentTarget) });
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

  return <form className="form revision-publish-form" onSubmit={submit}>
    <h2>Publish a revision</h2>
    <label>Revision title<input name="title" required maxLength={120} /></label>
    <label>Change description<textarea name="changeDescription" required minLength={1} maxLength={500} /></label>
    <label>Source file (ZIP, PSD, or another original format)<input name="source" type="file" /></label>
    <label>Source URL<input name="sourceUrl" type="url" placeholder="https://…" /></label>
    <label>Previews (PNG/JPG, up to 10)<input name="previews" type="file" accept="image/png,image/jpeg" multiple required onChange={selectPreviews} /></label>
    {files.map((file, index) => <label key={`${file.name}-${index}`}>Alt text for {file.name}<input name="altTexts" required maxLength={500} /></label>)}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" disabled={submitting}>{submitting ? "Publishing…" : "Publish revision"}</button>
  </form>;
}
