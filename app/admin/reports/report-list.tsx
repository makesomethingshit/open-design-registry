"use client";

import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Panel, Stack } from "@/src/components/ui/layout";

type Report = { id: string; reason: string; details: string; status: string; project?: { title: string; slug: string } | null; revision?: { number: number; project: { title: string; slug: string } } | null; reporter: { name: string; email: string } };

export default function ReportList({ reports }: { reports: Report[] }) {
  const [items, setItems] = useState(reports);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successes, setSuccesses] = useState<Record<string, string>>({});

  async function resolve(id: string, hide: boolean) {
    if (pendingId) return;
    setPendingId(id);
    setErrors((current) => ({ ...current, [id]: "" }));
    setSuccesses((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/admin/reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "RESOLVED", hide }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setErrors((current) => ({ ...current, [id]: payload?.error ?? "신고를 처리하지 못했습니다." }));
        return;
      }
      setItems((current) => current.map((report) => report.id === id ? { ...report, status: "RESOLVED" } : report));
      setSuccesses((current) => ({ ...current, [id]: hide ? "공개 노출을 제거하고 신고를 해결했습니다." : "신고 검토를 완료했습니다." }));
    } catch {
      setErrors((current) => ({ ...current, [id]: "신고를 처리하지 못했습니다. 다시 시도해 주세요." }));
    } finally {
      setPendingId(null);
    }
  }

  if (!items.length) return <EmptyState title="검토할 신고가 없습니다." icon="check">현재 대기 중인 신고가 없습니다.</EmptyState>;
  return <Stack gap={3}>
    {items.map((report) => <Panel className="card" key={report.id}>
      <Stack gap={3}>
        <p className="meta"><Badge tone={report.status === "OPEN" ? "warning" : "success"}>{report.status}</Badge> · {report.reporter.name} ({report.reporter.email})</p>
        <h2>{report.project?.title ?? `${report.revision?.project.title} · Revision ${report.revision?.number}`}</h2>
        <p><strong>{report.reason}</strong></p>
        <p>{report.details}</p>
        {report.status === "OPEN" && <div className="actions">
          <Button disabled={Boolean(pendingId && pendingId !== report.id)} loading={pendingId === report.id} loadingLabel="처리 중" onClick={() => { void resolve(report.id, true); }} type="button">공개 노출 제거 후 해결</Button>
          <Button disabled={Boolean(pendingId)} onClick={() => { void resolve(report.id, false); }} type="button" variant="secondary">검토 완료</Button>
        </div>}
        {errors[report.id] && <Banner tone="error" title="신고 처리 실패">{errors[report.id]}</Banner>}
        {successes[report.id] && <Banner tone="success" title="처리 완료">{successes[report.id]}</Banner>}
      </Stack>
    </Panel>)}
  </Stack>;
}
