"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button, TextLink } from "@/src/components/ui/button";
import { Field, Input, Textarea } from "@/src/components/ui/field";
import { Inline } from "@/src/components/ui/layout";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import styles from "./release-form.module.css";

type RevisionOption = { id: string; number: number; title: string };

export default function ReleaseForm({ revisions, slug }: { revisions: RevisionOption[]; slug: string }) {
  const router = useRouter();
  const revisionsField = useRef<HTMLFieldSetElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function toggleRevision(id: string, checked: boolean) {
    if (checked && selectedIds.length >= 50) {
      setFieldErrors((current) => ({ ...current, revisionIds: "Select no more than 50 revisions." }));
      return;
    }
    setSelectedIds((current) => checked ? [...current, id] : current.filter((selected) => selected !== id));
    clearFieldError("revisionIds");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      setFieldErrors(invalidFieldErrors(form));
      focusFirstInvalid(form);
      return;
    }

    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (!title) {
      setFieldErrors((current) => ({ ...current, title: "Enter a release title." }));
      form.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
      return;
    }
    if (!selectedIds.length || selectedIds.length > 50) {
      setFieldErrors((current) => ({ ...current, revisionIds: "Select between 1 and 50 revisions." }));
      revisionsField.current?.focus();
      return;
    }

    setError("");
    setFieldErrors({});
    setSubmitting(true);
    let navigated = false;
    try {
      const response = await fetch(`/api/projects/${slug}/releases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description: String(data.get("description") ?? "").trim(), revisionIds: selectedIds }),
      });
      const payload = await response.json().catch(() => null) as { number?: number; error?: string } | null;
      if (response.status === 409) {
        setError("A release was published at the same time. Review your selection and try again.");
        return;
      }
      if (!response.ok || !payload || !Number.isInteger(payload.number) || payload.number! < 1) {
        setError(response.status === 400 ? payload?.error ?? "Check the release details and try again." : "Couldn’t publish the release. Try again.");
        return;
      }
      router.push(`/projects/${slug}/releases/${payload.number}`);
      router.refresh();
      navigated = true;
    } catch {
      setError("Couldn’t publish the release. Try again.");
    } finally {
      if (!navigated) setSubmitting(false);
    }
  }

  return <form aria-busy={submitting} className="form" onSubmit={submit}>
    <Field error={fieldErrors.title} id="release-title" invalid={Boolean(fieldErrors.title)} label="Release title" required>
      <Input autoComplete="off" maxLength={120} name="title" onChange={() => clearFieldError("title")} required />
    </Field>
    <Field description="Optional · up to 2,000 characters" error={fieldErrors.description} id="release-description" invalid={Boolean(fieldErrors.description)} label="Description">
      <Textarea maxLength={2000} name="description" onChange={() => clearFieldError("description")} />
    </Field>
    <fieldset
      aria-describedby={fieldErrors.revisionIds ? "release-revisions-error" : "release-revisions-help"}
      aria-invalid={Boolean(fieldErrors.revisionIds) || undefined}
      className={styles.revisions}
      disabled={!revisions.length || submitting}
      ref={revisionsField}
      tabIndex={-1}
    >
      <legend>Revisions <span aria-hidden="true">*</span></legend>
      <p id="release-revisions-help">Choose 1–50 published revisions. They will appear in revision number order.</p>
      {fieldErrors.revisionIds && <p className={styles.fieldError} id="release-revisions-error" role="alert">{fieldErrors.revisionIds}</p>}
      {revisions.length ? <ul className={styles.revisionOptions}>{revisions.map((revision) => <li key={revision.id}>
        <label htmlFor={`release-revision-${revision.id}`}>
          <input checked={selectedIds.includes(revision.id)} id={`release-revision-${revision.id}`} name="revisionIds" onChange={(event) => toggleRevision(revision.id, event.currentTarget.checked)} type="checkbox" value={revision.id} />
          <span>Revision {revision.number} <span aria-hidden="true">·</span> {revision.title}</span>
        </label>
      </li>)}</ul> : <p role="status">No published revisions available.</p>}
    </fieldset>
    {error && <Banner tone="error" title="Release could not be published">{error}</Banner>}
    <p aria-live="polite" className="sr-only" role="status">{submitting ? "Publishing…" : ""}</p>
    <Inline className={styles.actions} gap={3}>
      <Button disabled={!revisions.length} loading={submitting} loadingLabel="Publishing release" type="submit">Publish release</Button>
      <TextLink href={`/projects/${slug}/releases`}>Cancel</TextLink>
    </Inline>
  </form>;
}
