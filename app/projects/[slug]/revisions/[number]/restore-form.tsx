"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { focusFirstInvalid } from "@/src/components/ui/form";
import { Stack } from "@/src/components/ui/layout";

export default function RestoreForm({ slug, number }: { slug: string; number: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
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
      router.refresh();
    } catch {
      setError("Could not restore revision. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="form restore-form" onSubmit={submit} aria-busy={submitting}>
    <Stack gap={3}>
      <h2>Restore this revision</h2>
      <p className="meta">Create a new published revision from this immutable snapshot. Existing history stays unchanged.</p>
      {error && <Banner tone="error" title="Could not restore revision">{error}</Banner>}
      <Button loading={submitting} loadingLabel="Restoring revision" type="submit">Restore as new revision</Button>
    </Stack>
  </form>;
}
