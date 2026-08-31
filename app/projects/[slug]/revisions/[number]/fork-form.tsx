"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ForkForm({ slug, number, signedIn }: { slug: string; number: number; signedIn: boolean }) {
  const router = useRouter(); const [error, setError] = useState("");
  if (!signedIn) return <p className="meta">Sign in to fork this revision.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const response = await fetch(`/api/projects/${slug}/revisions/${number}/fork`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), rightsConfirmed: form.get("rightsConfirmed") === "on" }) }); if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not fork revision"); return; } router.push(`/projects/${(await response.json()).slug}`); }
  return <form className="form fork-form" onSubmit={submit}><h2>Fork this revision</h2><input name="title" maxLength={120} placeholder="Fork project title (optional)" aria-label="Fork project title" /><label className="consent"><span><input name="rightsConfirmed" type="checkbox" required /> I have the rights to publish this fork under the displayed license.</span></label><button className="button">Create fork</button>{error && <p className="error">{error}</p>}</form>;
}
