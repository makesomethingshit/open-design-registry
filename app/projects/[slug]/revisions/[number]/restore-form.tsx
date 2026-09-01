"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RestoreForm({ slug, number }: { slug: string; number: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/revisions/${number}/restore`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string; number?: number } | null;
      if (!response.ok) {
        setError(payload?.error ?? "Could not restore revision");
        return;
      }
      if (typeof payload?.number !== "number") {
        setError("Could not restore revision");
        return;
      }
      router.push(`/projects/${slug}/revisions/${payload.number}`);
    } catch {
      setError("Could not restore revision");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form restore-form" onSubmit={submit}><h2>Restore this revision</h2><p className="meta">Create a new published revision from this immutable snapshot. Existing history stays unchanged.</p>{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={submitting}>{submitting ? "Restoring…" : "Restore as new revision"}</button></form>;
}
