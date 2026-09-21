"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, StatusBadge } from "@/src/components/ui/badge";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid } from "@/src/components/ui/form";
import { Panel, Stack } from "@/src/components/ui/layout";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";

type Revision = { id: string; number: number; title?: string };
type Proposal = { id: string; proposalNumber: number; title: string; status: string; appliedRevisions: Revision[] };
type Issue = { id: string; title: string; body: string; status: "OPEN" | "CLOSED"; revision: { number: number } | null; author: { name: string }; comments: Array<{ id: string; body: string; author: { name: string } }>; proposals?: Proposal[] };
type OperationError = { scope: "create" | "comment" | "toggle"; id?: string; message: string };

export default function IssueBoard({ slug, issues, revisions, canManage, signedIn }: { slug: string; issues: Issue[]; revisions: Revision[]; canManage: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<OperationError | null>(null);
  const [success, setSuccess] = useState("");
  const [creating, setCreating] = useState(false);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    if (!event.currentTarget.checkValidity()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setError(null);
    setSuccess("");
    setCreating(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/projects/${slug}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), body: form.get("body"), revisionId: form.get("revisionId") || undefined }) });
      if (!response.ok) {
        setError({ scope: "create", message: (await response.json().catch(() => null))?.error ?? "Could not create issue" });
        return;
      }
      formElement.reset();
      setSuccess("Issue opened.");
      router.refresh();
    } catch {
      setError({ scope: "create", message: "Could not create issue. Try again." });
    } finally {
      setCreating(false);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (commentingId) return;
    if (!event.currentTarget.checkValidity()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setError(null);
    setSuccess("");
    setCommentingId(id);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/issues/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: form.get("body") }) });
      if (!response.ok) {
        setError({ scope: "comment", id, message: (await response.json().catch(() => null))?.error ?? "Could not add a comment" });
        return;
      }
      formElement.reset();
      setSuccess("Comment added.");
      router.refresh();
    } catch {
      setError({ scope: "comment", id, message: "Could not add a comment. Try again." });
    } finally {
      setCommentingId(null);
    }
  }

  async function toggle(id: string, status: Issue["status"]) {
    if (togglingId) return;
    setError(null);
    setSuccess("");
    setTogglingId(id);
    try {
      const response = await fetch(`/api/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status === "OPEN" ? "CLOSED" : "OPEN" }) });
      if (!response.ok) {
        setError({ scope: "toggle", id, message: (await response.json().catch(() => null))?.error ?? "Could not update issue" });
        return;
      }
      setSuccess(status === "OPEN" ? "Issue closed." : "Issue reopened.");
      router.refresh();
    } catch {
      setError({ scope: "toggle", id, message: "Could not update issue. Try again." });
    } finally {
      setTogglingId(null);
    }
  }

  return <section id="issues" className="repo-panel" aria-labelledby="issues-heading">
    <div className="section-heading"><h2 id="issues-heading">Issues</h2><Badge>{issues.length}</Badge></div>
    {success && <Banner tone="success" title="Issue activity updated">{success}</Banner>}
    {issues.length ? <div className="issues">{issues.map((issue) => <article className="issue" id={`issue-${issue.id}`} key={issue.id}>
      <Stack gap={3}>
        <div className="issue-heading"><h3>{issue.title}</h3><StatusBadge tone={issue.status === "OPEN" ? "success" : "neutral"}>{issue.status}</StatusBadge></div>
        <p>{issue.body}</p>
        <p className="meta">Opened by {issue.author.name}{issue.revision ? ` · Revision ${issue.revision.number}` : ""}</p>
        {issue.proposals?.length ? <section aria-labelledby={`issue-${issue.id}-proposals`}><p className="meta" id={`issue-${issue.id}-proposals`}>Related proposals</p><ul className="issue-proposals">{issue.proposals.map((proposal) => {
          const presentation = proposalStatusPresentation(proposal.status);
          return <li key={proposal.id}><Link href={`/proposals/${proposal.id}`}>#{proposal.proposalNumber} · {proposal.title}</Link> <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>{proposal.appliedRevisions.length > 0 && <span className="meta"> · Applied in {proposal.appliedRevisions.map((revision, index) => <span key={revision.id}>{index > 0 ? ", " : ""}<Link href={`/projects/${slug}/revisions/${revision.number}`}>Revision {revision.number}</Link></span>)}</span>}</li>;
        })}</ul></section> : null}
        {issue.comments.map((commentItem) => <div className="issue-comment" key={commentItem.id}><p>{commentItem.body}</p><span className="meta">{commentItem.author.name}</span></div>)}
        {signedIn && issue.status === "OPEN" && <form onSubmit={(event) => { void comment(event, issue.id); }} className="inline-form" aria-busy={commentingId === issue.id}>
          <Input name="body" required maxLength={10000} placeholder="Add a comment" aria-label={`Comment on ${issue.title}`} />
          <Button loading={commentingId === issue.id} loadingLabel="Saving comment" disabled={Boolean(commentingId)} size="sm" type="submit" variant="secondary">Comment</Button>
        </form>}
        {error?.scope === "comment" && error.id === issue.id && <Banner tone="error" title="Comment failed">{error.message}</Banner>}
        {canManage && <Button disabled={Boolean(togglingId)} loading={togglingId === issue.id} loadingLabel="Updating issue" onClick={() => { void toggle(issue.id, issue.status); }} size="sm" type="button" variant="secondary">{issue.status === "OPEN" ? "Close issue" : "Reopen issue"}</Button>}
        {error?.scope === "toggle" && error.id === issue.id && <Banner tone="error" title="Issue update failed">{error.message}</Banner>}
      </Stack>
    </article>)}</div> : <p className="empty-state">No issues yet.</p>}
    {signedIn ? <Panel className="issue-form">
      <form onSubmit={(event) => { void create(event); }} aria-busy={creating}>
        <Stack gap={3}>
          <h3>Open an issue</h3>
          <Field id="issue-title" label="Issue title" required><Input name="title" required maxLength={200} /></Field>
          <Field id="issue-body" label="Issue description"><Textarea name="body" maxLength={10000} /></Field>
          {revisions.length > 0 && <Field id="issue-revision" label="Related revision"><Select name="revisionId" defaultValue=""><option value="">No related revision</option>{revisions.map((revision) => <option value={revision.id} key={revision.id}>Revision {revision.number}</option>)}</Select></Field>}
          {error?.scope === "create" && <Banner tone="error" title="Issue creation failed">{error.message}</Banner>}
          <Button loading={creating} loadingLabel="Opening issue" type="submit">Open issue</Button>
        </Stack>
      </form>
    </Panel> : <p className="meta">Sign in to open issues or comment.</p>}
  </section>;
}
