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
        setError((await response.json().catch(() => null))?.error ?? "신고를 접수하지 못했습니다.");
        return;
      }
      formElement.reset();
      setSuccess("신고가 접수되었습니다.");
    } catch {
      setError("신고를 접수하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="report-form" noValidate onSubmit={submit} aria-busy={submitting}>
    <Stack gap={3}>
      <h3>공개 내용 신고</h3>
      <Field error={fieldErrors.reason} id="report-reason" invalid={Boolean(fieldErrors.reason)} label="사유" required><Input name="reason" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.reason; return next; })} required maxLength={120} /></Field>
      <Field error={fieldErrors.details} id="report-details" invalid={Boolean(fieldErrors.details)} label="상세 설명"><Textarea name="details" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.details; return next; })} maxLength={2000} /></Field>
      {error && <Banner tone="error" title="신고 접수 실패">{error}</Banner>}
      {success && <Banner tone="success" title="신고 접수 완료">{success}</Banner>}
      <Button disabled={submitting} loading={submitting} loadingLabel="접수 중" type="submit" variant="secondary">신고 제출</Button>
    </Stack>
  </form>;
}
