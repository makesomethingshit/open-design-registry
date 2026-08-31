"use client";

import { FormEvent, useState } from "react";

export default function ReportForm({ projectSlug, revisionId }: { projectSlug?: string; revisionId?: string }) {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectSlug, revisionId, reason: form.get("reason"), details: form.get("details") }) });
    setMessage(response.ok ? "신고가 접수되었습니다." : ((await response.json().catch(() => null))?.error ?? "신고를 접수하지 못했습니다."));
    if (response.ok) event.currentTarget.reset();
  }
  return <form className="report-form" onSubmit={submit}><h3>공개 내용 신고</h3><label>사유<input name="reason" required maxLength={120} /></label><label>상세 설명<textarea name="details" maxLength={2000} /></label><button className="button secondary">신고 제출</button>{message && <p aria-live="polite" className="meta">{message}</p>}</form>;
}
