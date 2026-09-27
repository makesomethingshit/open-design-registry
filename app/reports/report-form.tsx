"use client";

import { type FormEvent, useState } from "react";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { Stack } from "@/src/components/ui/layout";

export default function ReportForm({ projectSlug, revisionId }: { projectSlug?: string; revisionId?: string }) {
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      setFieldErrors(invalidFieldErrors(formElement));
      focusFirstInvalid(formElement);
      return;
    }
    setFieldErrors({});
    setError("");
    setSuccess("");
    setSubmitting(true);
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectSlug, revisionId, reason: form.get("reason"), details: form.get("details") }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "Could not submit this report.");
        return;
      }
      formElement.reset();
      setSuccess("Report submitted.");
    } catch {
      setError("Could not submit this report. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="report-form" noValidate onSubmit={submit} aria-busy={submitting}>
    <Stack gap={3}>
      <h3>Report this content</h3>
      <Field error={fieldErrors.reason} id="report-reason" invalid={Boolean(fieldErrors.reason)} label="Reason" required><Input name="reason" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.reason; return next; })} required maxLength={120} /></Field>
      <Field error={fieldErrors.details} id="report-details" invalid={Boolean(fieldErrors.details)} label="Additional details"><Textarea name="details" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.details; return next; })} maxLength={2000} /></Field>
      {error && <Banner tone="error" title="Could not submit report">{error}</Banner>}
      {success && <Banner tone="success" title="Report submitted">{success}</Banner>}
      <Button disabled={submitting} loading={submitting} loadingLabel="Submitting report" type="submit" variant="secondary">Submit report</Button>
    </Stack>
  </form>;
}
