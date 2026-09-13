"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ForkForm({ slug, number, license, signedIn }: { slug: string; number: number; license: string; signedIn: boolean }) {
  const router = useRouter(); const searchParams = useSearchParams(); const [error, setError] = useState(""); const contribution = searchParams.get("intent") === "proposal";
  if (!signedIn) return <p className="meta">Sign in to fork this revision.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); const form = new FormData(event.currentTarget); const response = await fetch(`/api/projects/${slug}/revisions/${number}/fork`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), rightsConfirmed: form.get("rightsConfirmed") === "on" }) }); if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not fork revision"); return; } const fork = await response.json(); router.push(contribution ? `/projects/${slug}/proposals/new?sourceProject=${encodeURIComponent(fork.slug)}&sourceRevision=1&baseRevision=${number}` : `/projects/${fork.slug}`); }
  return <form className="form fork-form" onSubmit={submit}><h2>{contribution ? "Start a contribution" : "Fork this revision"}</h2><p className="meta">License: {license}</p><input name="title" maxLength={120} placeholder="Fork project title (optional)" aria-label="Fork project title" /><label className="consent"><span><input name="rightsConfirmed" type="checkbox" required /> I have the rights to publish this fork under the displayed license.</span></label><button className="button">{contribution ? "Create contribution workspace" : "Create fork"}</button>{error && <p className="error">{error}</p>}</form>;
}
