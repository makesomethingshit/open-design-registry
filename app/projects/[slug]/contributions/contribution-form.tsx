"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type Choice = { id: string; label: string };
export default function ContributionForm({ slug, baseRevisionId, baseNumber, choices }: { slug: string; baseRevisionId: string; baseNumber: number; choices: Choice[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/projects/${slug}/contributions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), body: form.get("body"), proposedRevisionId: form.get("proposedRevisionId"), baseRevisionId, rightsConfirmed: form.get("rightsConfirmed") === "on" }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not submit proposal"); return; }
      router.push(`/projects/${slug}/contributions/${data.id}`);
      window.dispatchEvent(new Event("notifications-state-changed"));
    } catch { setError("Could not submit proposal. Check the proposal list before retrying."); }
    finally { setBusy(false); }
  }
  if (!choices.length) return <p className="empty-state">Fork a revision, publish your improvements, then return here to propose them.</p>;
  return <form className="form" onSubmit={submit} aria-label="New contribution proposal">
    <h2>Propose a change</h2>
    <p>Compare your work with project Revision {baseNumber} before submitting.</p>
    <label>Proposal title<input name="title" required maxLength={200} /></label>
    <label>What changed and why?<textarea name="body" required maxLength={10000} /></label>
    <label>Your proposed revision<select name="proposedRevisionId" required>{choices.map((choice) => <option value={choice.id} key={choice.id}>{choice.label}</option>)}</select></label>
    <label className="checkbox"><input name="rightsConfirmed" type="checkbox" required />I have compared this work with the current project and have the rights to publish it for review.</label>
    <p className="meta">Submitted versions remain available with this discussion, even if your fork later becomes private.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="button" disabled={busy}>{busy ? "Submitting…" : "Submit proposal"}</button>
  </form>;
}
