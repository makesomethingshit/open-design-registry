"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CapabilityBadge from "@/app/capability-badge";

export type ProposalListItem = { id: string; proposalNumber: number; title: string; status: string; author: string; updatedAt: string; approved: number; applied: number; total: number; summaries: string[]; moreChanges: number; capability: { mode: string | null; unitCount: number | null; adapterId: string | null; adapterVersion: string | null; adapterConfidence: string | null; adapterMaturity: string | null } };
type Filter = "open" | "closed";

export default function ProposalList({ slug, initialFilter, initialItems, initialCursor }: { slug: string; initialFilter: Filter; initialItems: ProposalListItem[]; initialCursor: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setFilter(initialFilter); setItems(initialItems); setCursor(initialCursor); }, [initialFilter, initialItems, initialCursor]);
  async function load(nextFilter: Filter, nextCursor?: string | null, append = false) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: nextFilter, limit: "20" });
    if (nextCursor) params.set("cursor", nextCursor);
    const response = await fetch(`/api/projects/${slug}/proposals?${params}`);
    setLoading(false);
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not load proposals"); return; }
    const page = await response.json() as { items: ProposalListItem[]; nextCursor: string | null };
    const nextItems = page.items;
    setItems((current) => append ? [...current, ...nextItems.filter((item) => !current.some((existing) => existing.id === item.id))] : nextItems);
    setCursor(page.nextCursor);
  }
  function changeFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    void load(next);
    router.replace(`${pathname}?proposalStatus=${next}`, { scroll: false });
  }
  return <><div className="proposal-filter" role="group" aria-label="Proposal status"><button type="button" className="button secondary" aria-pressed={filter === "open"} onClick={() => changeFilter("open")}>Open</button><button type="button" className="button secondary" aria-pressed={filter === "closed"} onClick={() => changeFilter("closed")}>Closed</button></div>{items.length ? <div className="proposal-list">{items.map((proposal) => <article className="proposal-row" key={proposal.id}><div><Link className="repo-name" href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} · {proposal.title}</Link><CapabilityBadge mode={proposal.capability.mode} unitCount={proposal.capability.unitCount} adapterId={proposal.capability.adapterId} adapterVersion={proposal.capability.adapterVersion} adapterConfidence={proposal.capability.adapterConfidence} adapterMaturity={proposal.capability.adapterMaturity} /><p className="meta">{proposal.author} · {new Date(proposal.updatedAt).toLocaleString()} · Approved {proposal.approved}/{proposal.total}{proposal.applied ? ` · Applied ${proposal.applied}/${proposal.total}` : ""}</p>{proposal.summaries.length > 0 && <p className="meta">{proposal.summaries.join(" · ")}{proposal.moreChanges ? ` · ${proposal.moreChanges} more changes` : ""}</p>}</div><span className={`proposal-status ${proposal.status.toLowerCase()}`}>{proposal.status.replaceAll("_", " ")}</span></article>)}</div> : <p className="empty-state">No {filter} proposals.</p>}{cursor && <button type="button" className="button secondary" disabled={loading} onClick={() => void load(filter, cursor, true)}>{loading ? "Loading…" : "Load more"}</button>}{!cursor && items.length > 0 && <p className="meta" role="status">All proposals loaded.</p>}{error && <p className="error" role="alert">{error} <button type="button" className="button secondary" onClick={() => void load(filter, cursor, Boolean(items.length))}>Retry</button></p>}</>;
}
