"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, StatusBadge } from "@/src/components/ui/badge";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { FormColumn, PageGrid, Panel, ReadingColumn, Stack } from "@/src/components/ui/layout";
import { setRowBusy, setRowMessage } from "@/src/lib/ui/task-state";
import { proposalStatusPresentation } from "@/src/lib/ui/status-presentation";

type Revision = { id: string; number: number; title?: string };
type Proposal = { id: string; proposalNumber: number; title: string; status: string; appliedRevisions: Revision[] };
type Issue = { id: string; title: string; body: string; status: "OPEN" | "CLOSED"; revision: { number: number } | null; author: { name: string }; comments: Array<{ id: string; body: string; author: { name: string } }>; proposals?: Proposal[] };

export default function IssueBoard({ slug, issues, revisions, canManage, signedIn }: { slug: string; issues: Issue[]; revisions: Revision[]; canManage: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [createError, setCreateError] = useState("");
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});
  const [createSuccess, setCreateSuccess] = useState("");
  const [commentSuccesses, setCommentSuccesses] = useState<Record<string, string>>({});
  const [toggleSuccesses, setToggleSuccesses] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [commentingIds, setCommentingIds] = useState<Record<string, boolean>>({});
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      setCreateFieldErrors(invalidFieldErrors(formElement));
      focusFirstInvalid(formElement);
      return;
    }
    setCreateFieldErrors({});
    setCreateError("");
    setCreateSuccess("");
    setCreating(true);
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/projects/${slug}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title"), body: form.get("body"), revisionId: form.get("revisionId") || undefined }) });
      if (!response.ok) {
        setCreateError((await response.json().catch(() => null))?.error ?? "Could not create issue");
        return;
      }
      formElement.reset();
      setCreateSuccess("Issue opened.");
      router.refresh();
    } catch {
      setCreateError("Could not create issue. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (commentingIds[id]) return;
    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      focusFirstInvalid(formElement);
      return;
    }
    setCommentErrors((current) => setRowMessage(current, id, ""));
    setCommentSuccesses((current) => setRowMessage(current, id, ""));
    setCommentingIds((current) => setRowBusy(current, id, true));
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/issues/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: form.get("body") }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setCommentErrors((current) => setRowMessage(current, id, payload?.error ?? "Could not add a comment"));
        return;
      }
      formElement.reset();
      setCommentSuccesses((current) => setRowMessage(current, id, "Comment added."));
      router.refresh();
    } catch {
      setCommentErrors((current) => setRowMessage(current, id, "Could not add a comment. Try again."));
    } finally {
      setCommentingIds((current) => setRowBusy(current, id, false));
    }
  }

  async function toggle(id: string, status: Issue["status"]) {
    if (togglingIds[id]) return;
    setToggleErrors((current) => setRowMessage(current, id, ""));
    setToggleSuccesses((current) => setRowMessage(current, id, ""));
    setTogglingIds((current) => setRowBusy(current, id, true));
    try {
      const response = await fetch(`/api/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: status === "OPEN" ? "CLOSED" : "OPEN" }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setToggleErrors((current) => setRowMessage(current, id, payload?.error ?? "Could not update issue"));
        return;
      }
      setToggleSuccesses((current) => setRowMessage(current, id, status === "OPEN" ? "Issue closed." : "Issue reopened."));
      router.refresh();
    } catch {
      setToggleErrors((current) => setRowMessage(current, id, "Could not update issue. Try again."));
    } finally {
      setTogglingIds((current) => setRowBusy(current, id, false));
    }
  }

  return <section id="issues" className="repo-panel" aria-labelledby="issues-heading">
    <PageGrid className="issue-grid">
    <ReadingColumn>
    <div className="section-heading"><h2 id="issues-heading">Issues</h2><Badge>{issues.length}</Badge></div>
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
        {signedIn && issue.status === "OPEN" && <form noValidate onSubmit={(event) => { void comment(event, issue.id); }} className="inline-form" aria-busy={Boolean(commentingIds[issue.id])}>
          <Input name="body" required maxLength={10000} placeholder="Add a comment" aria-label={`Comment on ${issue.title}`} />
          <Button loading={Boolean(commentingIds[issue.id])} loadingLabel="Saving comment" disabled={Boolean(commentingIds[issue.id])} size="sm" type="submit" variant="secondary">Comment</Button>
        </form>}
        {commentErrors[issue.id] && <Banner tone="error" title="Comment failed">{commentErrors[issue.id]}</Banner>}
        {commentSuccesses[issue.id] && <Banner tone="success" title="Comment added">{commentSuccesses[issue.id]}</Banner>}
        {canManage && <Button disabled={Boolean(togglingIds[issue.id])} loading={Boolean(togglingIds[issue.id])} loadingLabel="Updating issue" onClick={() => { void toggle(issue.id, issue.status); }} size="sm" type="button" variant="secondary">{issue.status === "OPEN" ? "Close issue" : "Reopen issue"}</Button>}
        {toggleErrors[issue.id] && <Banner tone="error" title="Issue update failed">{toggleErrors[issue.id]}</Banner>}
        {toggleSuccesses[issue.id] && <Banner tone="success" title="Issue updated">{toggleSuccesses[issue.id]}</Banner>}
      </Stack>
    </article>)}</div> : <p className="empty-state">No issues yet.</p>}
    </ReadingColumn>
    {signedIn ? <FormColumn><Panel className="issue-form">
      <form noValidate onSubmit={(event) => { void create(event); }} aria-busy={creating}>
        <Stack gap={3}>
          <h3>Open an issue</h3>
          <Field error={createFieldErrors.title} id="issue-title" invalid={Boolean(createFieldErrors.title)} label="Issue title" required><Input name="title" onChange={() => setCreateFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required maxLength={200} /></Field>
          <Field error={createFieldErrors.body} id="issue-body" invalid={Boolean(createFieldErrors.body)} label="Issue description"><Textarea name="body" onChange={() => setCreateFieldErrors((current) => { const next = { ...current }; delete next.body; return next; })} maxLength={10000} /></Field>
          {revisions.length > 0 && <Field id="issue-revision" label="Related revision"><Select name="revisionId" defaultValue=""><option value="">No related revision</option>{revisions.map((revision) => <option value={revision.id} key={revision.id}>Revision {revision.number}</option>)}</Select></Field>}
          {createError && <Banner tone="error" title="Issue creation failed">{createError}</Banner>}
          {createSuccess && <Banner tone="success" title="Issue opened">{createSuccess}</Banner>}
          <Button loading={creating} loadingLabel="Opening issue" type="submit">Open issue</Button>
        </Stack>
      </form>
    </Panel></FormColumn> : <p className="meta">Sign in to open issues or comment.</p>}
    </PageGrid>
  </section>;
}
