"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Field, Input } from "@/src/components/ui/field";
import { focusFirstInvalid } from "@/src/components/ui/form";
import { Stack } from "@/src/components/ui/layout";

export default function ForkForm({ slug, number, license, signedIn }: { slug: string; number: number; license: string; signedIn: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const contribution = searchParams.get("intent") === "proposal";

  if (!signedIn) return <p className="meta">Sign in to fork this revision.</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/projects/${slug}/revisions/${number}/fork`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), rightsConfirmed: form.get("rightsConfirmed") === "on" }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "Could not fork revision");
        return;
      }
      const fork = await response.json();
      router.push(contribution ? `/projects/${slug}/proposals/new?sourceProject=${encodeURIComponent(fork.slug)}&sourceRevision=1&baseRevision=${number}` : `/projects/${fork.slug}`);
    } catch {
      setError("Could not fork revision. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form fork-form" onSubmit={submit} aria-busy={submitting}>
    <Stack gap={3}>
      <h2>{contribution ? "Start a contribution" : "Fork this revision"}</h2>
      <p className="meta">License: {license}</p>
      <Field id="fork-title" label="Fork project title"><Input name="title" maxLength={120} placeholder="Fork project title (optional)" /></Field>
      <Checkbox label="I have the rights to publish this fork under the displayed license." name="rightsConfirmed" required />
      {error && <Banner tone="error" title="Could not fork revision">{error}</Banner>}
      <Button loading={submitting} loadingLabel={contribution ? "Creating workspace" : "Creating fork"} type="submit">{contribution ? "Create contribution workspace" : "Create fork"}</Button>
    </Stack>
  </form>;
}
