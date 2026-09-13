"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";

type Revision = { id: string; number: number; title?: string };
type Proposal = { id: string; proposalNumber: number; title: string; status: string; appliedRevisions: Revision[] };
type Issue = { id: string; title: string; body: string; status: "OPEN" | "CLOSED"; revision: { number: number } | null; author: { name: string }; comments: Array<{ id: string; body: string; author: { name: string } }>; proposals?: Proposal[] };

export default function IssueBoard({ slug, issues, revisions, canManage, signedIn }: { slug: string; issues: Issue[]; revisions: Revision[]; canManage: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/projects/${slug}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), body: form.get("body"), revisionId: form.get("revisionId") || undefined }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not create issue"); return; }
    formElement.reset();
    router.refresh();
  }

  async function comment(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/issues/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: form.get("body") }) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not add a comment"); return; }
    formElement.reset();
    router.refresh();
  }

  async function toggle(id: string, status: Issue["status"]) {
    await fetch(`/api/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status === "OPEN" ? "CLOSED" : "OPEN" }) });
    router.refresh();
  }

  return <section id="issues" className="repo-panel" aria-labelledby="issues-heading">
    <div className="section-heading"><h2 id="issues-heading">Issues</h2><span className="section-count">{issues.length}</span></div>
    {issues.length ? <div className="issues">{issues.map((issue) => <article className="issue" id={`issue-${issue.id}`} key={issue.id}>
      <div className="issue-heading"><h3>{issue.title}</h3><span className={`issue-status ${issue.status.toLowerCase()}`}>{issue.status}</span></div>
      <p>{issue.body}</p>
      <p className="meta">Opened by {issue.author.name}{issue.revision ? ` · Revision ${issue.revision.number}` : ""}</p>
      {issue.proposals?.length ? <section aria-labelledby={`issue-${issue.id}-proposals`}><p className="meta" id={`issue-${issue.id}-proposals`}>Related proposals</p><ul className="issue-proposals">{issue.proposals.map((proposal) => {
        const presentation = proposalStatusPresentation(proposal.status);
        return <li key={proposal.id}><Link href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} · {proposal.title}</Link> <span className="meta">{presentation.label}</span>{proposal.appliedRevisions.length > 0 && <span className="meta"> · Applied in {proposal.appliedRevisions.map((revision, index) => <span key={revision.id}>{index > 0 ? ", " : ""}<Link href={`/projects/${slug}/revisions/${revision.number}`}>Revision {revision.number}</Link></span>)}</span>}</li>;
      })}</ul></section> : null}
      {issue.comments.map((comment) => <div className="issue-comment" key={comment.id}><p>{comment.body}</p><span className="meta">{comment.author.name}</span></div>)}
      {signedIn && issue.status === "OPEN" && <form onSubmit={(event) => comment(event, issue.id)} className="inline-form"><input name="body" required maxLength={10000} placeholder="Add a comment" aria-label={`Comment on ${issue.title}`} /><button className="button secondary">Comment</button></form>}
      {canManage && <button type="button" className="button secondary" onClick={() => toggle(issue.id, issue.status)}>{issue.status === "OPEN" ? "Close issue" : "Reopen issue"}</button>}
    </article>)}</div> : <p className="empty-state">No issues yet.</p>}
    {signedIn ? <form className="form issue-form" onSubmit={create}><h3>Open an issue</h3><input name="title" required maxLength={200} placeholder="Issue title" aria-label="Issue title" /><textarea name="body" maxLength={10000} placeholder="Describe the issue" aria-label="Issue description" />{revisions.length > 0 && <select name="revisionId" defaultValue="" aria-label="Related revision"><option value="">No related revision</option>{revisions.map((revision) => <option value={revision.id} key={revision.id}>Revision {revision.number}</option>)}</select>}<button className="button">Open issue</button>{error && <p className="error">{error}</p>}</form> : <p className="meta">Sign in to open issues or comment.</p>}
  </section>;
}
