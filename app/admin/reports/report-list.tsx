"use client";

import { useState } from "react";
import { Badge } from "@/src/components/ui/badge";
import { Banner, EmptyState } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Panel, Stack } from "@/src/components/ui/layout";
import { setRowBusy } from "@/src/lib/ui/task-state";

type Report = {
  id: string;
  reason: string;
  details: string;
  status: string;
  sourceMissing?: boolean;
  coverSharedCount: number;
  projectHidden: boolean;
  coverBlocked: boolean;
  project?: { id: string; title: string; slug: string; coverUrl: string } | null;
  revision?: { number: number; project: { id: string; title: string; slug: string; coverUrl: string } } | null;
  reporter: { name: string; email: string };
};

type Action = "NONE" | "HIDE_PROJECT" | "BLOCK_COVER" | "RESTORE_PROJECT" | "UNBLOCK_COVER";

export default function ReportList({ reports }: { reports: Report[] }) {
  const [items, setItems] = useState(reports);
  const [pendingById, setPendingById] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successes, setSuccesses] = useState<Record<string, string>>({});

  async function decide(report: Report, action: Action) {
    if (pendingById[report.id]) return;
    if (action === "HIDE_PROJECT" && !window.confirm("Hide only the reported project? Other owners' forks will remain public.")) return;
    if (action === "BLOCK_COVER" && !window.confirm(
      `Block this cover asset across all referencing projects? At least ${report.coverSharedCount} project(s) use the same stored cover URL. Other projects will remain public.`
    )) return;
    const restoring = action === "RESTORE_PROJECT" || action === "UNBLOCK_COVER";
    setPendingById((current) => setRowBusy(current, report.id, true));
    setErrors((current) => ({ ...current, [report.id]: "" }));
    setSuccesses((current) => ({ ...current, [report.id]: "" }));
    try {
      const response = await fetch(`/api/admin/reports/${report.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(restoring ? { action } : { status: "RESOLVED", action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setErrors((current) => ({ ...current, [report.id]: payload?.error ?? "Could not update moderation decision." }));
        return;
      }
      setItems((current) => current.map((item) => item.id === report.id
        ? {
            ...item,
            status: restoring ? item.status : "RESOLVED",
            projectHidden: action === "HIDE_PROJECT" ? true : action === "RESTORE_PROJECT" ? false : item.projectHidden,
            coverBlocked: action === "BLOCK_COVER" ? true : action === "UNBLOCK_COVER" ? false : item.coverBlocked,
          }
        : item));
      const messages: Record<Action, string> = {
        NONE: "Report review complete.",
        HIDE_PROJECT: "Only the reported project was hidden; other forks remain public.",
        BLOCK_COVER: "The shared cover was blocked across projects without changing project visibility.",
        RESTORE_PROJECT: "This project hide was lifted. An owner-private or deleted project is not made public.",
        UNBLOCK_COVER: "This report's block was lifted. Other active reports may still keep the image hidden.",
      };
      setSuccesses((current) => ({ ...current, [report.id]: messages[action] }));
    } catch {
      setErrors((current) => ({ ...current, [report.id]: "Could not update moderation decision. Please try again." }));
    } finally {
      setPendingById((current) => setRowBusy(current, report.id, false));
    }
  }

  if (!items.length) return <EmptyState title="No reports to review." icon="check">There are no reports awaiting review.</EmptyState>;
  return <Stack gap={3}>
    {items.map((report) => <Panel className="card" key={report.id}>
      <Stack gap={3}>
        <p className="meta"><Badge tone={report.status === "OPEN" ? "warning" : "success"}>{report.status}</Badge> · {report.reporter.name}{report.reporter.email && ` (${report.reporter.email})`}</p>
        <h2>{report.sourceMissing ? `Retained decision ${report.id}` : report.project?.title ?? `${report.revision?.project.title} · Revision ${report.revision?.number}`}</h2>
        <p><strong>{report.reason}</strong></p>
        <p>{report.details}</p>
        {!report.sourceMissing && (report.status === "OPEN" || (report.status === "RESOLVED" && (report.projectHidden || report.coverBlocked))) && <>
          <p className="meta">The reported project can be hidden independently. The cover URL is referenced by {report.coverSharedCount} project(s); blocking its underlying object applies globally, including forks. This count does not include differently formatted URLs or other asset references.</p>
          <div className="actions">
            {!report.projectHidden && <Button disabled={Boolean(pendingById[report.id])} onClick={() => { void decide(report, "HIDE_PROJECT"); }} type="button">Hide this project and resolve</Button>}
            {!report.coverBlocked && <Button disabled={Boolean(pendingById[report.id])} onClick={() => { void decide(report, "BLOCK_COVER"); }} type="button" variant="secondary">Block shared cover and resolve</Button>}
            {report.status === "OPEN" && <Button disabled={Boolean(pendingById[report.id])} onClick={() => { void decide(report, "NONE"); }} type="button" variant="secondary">Mark as reviewed</Button>}
          </div>
        </>}
        {(report.projectHidden || report.coverBlocked) && <div className="actions">
          {report.projectHidden && <Button disabled={Boolean(pendingById[report.id])} onClick={() => { void decide(report, "RESTORE_PROJECT"); }} type="button" variant="secondary">Restore project visibility</Button>}
          {report.coverBlocked && <Button disabled={Boolean(pendingById[report.id])} onClick={() => { void decide(report, "UNBLOCK_COVER"); }} type="button" variant="secondary">Lift this report's asset blocks</Button>}
        </div>}
        {errors[report.id] && <Banner tone="error" title="Could not update report">{errors[report.id]}</Banner>}
        {successes[report.id] && <Banner tone="success" title="Moderation updated">{successes[report.id]}</Banner>}
      </Stack>
    </Panel>)}
  </Stack>;
}
