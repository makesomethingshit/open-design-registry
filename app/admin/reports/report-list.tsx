"use client";

import { useState } from "react";

type Report = { id: string; reason: string; details: string; status: string; project?: { title: string; slug: string } | null; revision?: { number: number; project: { title: string; slug: string } } | null; reporter: { name: string; email: string } };

export default function ReportList({ reports }: { reports: Report[] }) {
  const [items, setItems] = useState(reports);
  async function resolve(id: string, hide: boolean) {
    const response = await fetch(`/api/admin/reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "RESOLVED", hide }) });
    if (response.ok) setItems((current) => current.map((report) => report.id === id ? { ...report, status: "RESOLVED" } : report));
  }
  return <div className="report-list">{items.map((report) => <article className="card" key={report.id}><div className="card-content"><p className="meta">{report.status} · {report.reporter.name} ({report.reporter.email})</p><h2>{report.project?.title ?? `${report.revision?.project.title} · Revision ${report.revision?.number}`}</h2><p><strong>{report.reason}</strong></p><p>{report.details}</p>{report.status === "OPEN" && <div><button className="button" onClick={() => resolve(report.id, true)}>공개 노출 제거 후 해결</button> <button className="button secondary" onClick={() => resolve(report.id, false)}>검토 완료</button></div>}</div></article>)}</div>;
}
