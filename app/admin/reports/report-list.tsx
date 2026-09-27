"use client";

import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Panel, Stack } from "@/src/components/ui/layout";
import { setRowBusy } from "@/src/lib/ui/task-state";

type Report = { id: string; reason: string; details: string; status: string; project?: { title: string; slug: string } | null; revision?: { number: number; project: { title: string; slug: string } } | null; reporter: { name: string; email: string } };

export default function ReportList({ reports }: { reports: Report[] }) {
  const [items, setItems] = useState(reports);
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successes, setSuccesses] = useState<Record<string, string>>({});

  async function resolve(id: string, hide: boolean) {
    if (pendingById[id]) return;
    setPendingById((current) => setRowBusy(current, id, true));
    setErrors((current) => ({ ...current, [id]: "" }));
    setSuccesses((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/admin/reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "RESOLVED", hide }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setErrors((current) => ({ ...current, [id]: payload?.error ?? "Could not resolve the report." }));
        return;
      }
      setItems((current) => current.map((report) => report.id === id ? { ...report, status: "RESOLVED" } : report));
      setSuccesses((current) => ({ ...current, [id]: hide ? "Removed the content from public view and resolved the report." : "Report review complete." }));
    } catch {
      setErrors((current) => ({ ...current, [id]: "Could not resolve the report. Please try again." }));
    } finally {
      setPendingById((current) => setRowBusy(current, id, false));
    }
  }

  if (!items.length) return <EmptyState title="No reports to review." icon="check">There are no reports awaiting review.</EmptyState>;
  return <Stack gap={3}>
    {items.map((report) => <Panel className="card" key={report.id}>
      <Stack gap={3}>
        <p className="meta"><Badge tone={report.status === "OPEN" ? "warning" : "success"}>{report.status}</Badge> · {report.reporter.name} ({report.reporter.email})</p>
        <h2>{report.project?.title ?? `${report.revision?.project.title} · Revision ${report.revision?.number}`}</h2>
        <p><strong>{report.reason}</strong></p>
        <p>{report.details}</p>
        {report.status === "OPEN" && <div className="actions">
          <Button loading={Boolean(pendingById[report.id])} loadingLabel="Resolving report" onClick={() => { void resolve(report.id, true); }} type="button">Remove from public view and resolve</Button>
          <Button disabled={Boolean(pendingById[report.id])} onClick={() => { void resolve(report.id, false); }} type="button" variant="secondary">Mark as reviewed</Button>
        </div>}
        {errors[report.id] && <Banner tone="error" title="Could not resolve report">{errors[report.id]}</Banner>}
        {successes[report.id] && <Banner tone="success" title="Report resolved">{successes[report.id]}</Banner>}
      </Stack>
    </Panel>)}
  </Stack>;
}
