"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CapabilityBadge from "@/app/capability-badge";
import { StatusBadge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";
import styles from "./proposal-list.module.css";

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
    setItems((current) => append ? [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))] : page.items);
    setCursor(page.nextCursor);
  }

  function changeFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    void load(next);
    router.replace(`${pathname}?proposalStatus=${next}`, { scroll: false });
  }

  return <div className={styles.root}>
    <div className={styles.filter} role="group" aria-label="Proposal status"><Button aria-pressed={filter === "open"} onClick={() => changeFilter("open")} variant="secondary">Open</Button><Button aria-pressed={filter === "closed"} onClick={() => changeFilter("closed")} variant="secondary">Closed</Button></div>
    {items.length ? <div className={styles.list}>{items.map((proposal) => {
      const presentation = proposalStatusPresentation(proposal.status, proposal.applied, proposal.total);
      return <article className={styles.row} key={proposal.id}>
        <div className={styles.content}><Link href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} <span aria-hidden="true">·</span> {proposal.title}</Link><p>{proposal.author} <span aria-hidden="true">·</span> <time dateTime={proposal.updatedAt}>{new Date(proposal.updatedAt).toLocaleString()}</time> <span aria-hidden="true">·</span> Approved {proposal.approved}/{proposal.total}{proposal.applied ? ` · Applied ${proposal.applied}/${proposal.total}` : ""}</p>{proposal.summaries.length > 0 && <p>{proposal.summaries.join(" · ")}{proposal.moreChanges ? ` · ${proposal.moreChanges} more changes` : ""}</p>}<CapabilityBadge adapterConfidence={proposal.capability.adapterConfidence} adapterId={proposal.capability.adapterId} adapterMaturity={proposal.capability.adapterMaturity} adapterVersion={proposal.capability.adapterVersion} mode={proposal.capability.mode} unitCount={proposal.capability.unitCount} /></div>
        <StatusBadge icon={presentation.icon} tone={presentation.tone}>{presentation.label}</StatusBadge>
      </article>;
    })}</div> : <p className={styles.empty}>No {filter} proposals.</p>}
    {cursor && <Button disabled={loading} loading={loading} loadingLabel="Loading proposals" onClick={() => void load(filter, cursor, true)} variant="secondary">Load more</Button>}
    {!cursor && items.length > 0 && <p className={styles.complete} role="status">All proposals loaded.</p>}
    {error && <p className={styles.error} role="alert">{error} <Button onClick={() => void load(filter, cursor, Boolean(items.length))} variant="secondary">Retry</Button></p>}
  </div>;
}
