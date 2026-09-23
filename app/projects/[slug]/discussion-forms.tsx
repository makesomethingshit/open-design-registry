"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Textarea } from "@/src/components/ui/field";
import { Panel, Stack } from "@/src/components/ui/layout";
import { discussionCommentSchema, discussionSchema } from "@/src/lib/discussion-validation";
import { issueSchema } from "@/src/lib/project-validation";
import styles from "./project.module.css";

export function DiscussionCreateForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const parsed = discussionSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(({ path, message }) => [String(path[0]), message])));
      const first = parsed.error.issues[0]?.path[0];
      if (first) (form.elements.namedItem(String(first)) as HTMLElement | null)?.focus();
      return;
    }
    setFieldErrors({});
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/discussions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) {
        setError(payload?.error ?? "Could not create discussion. Try again.");
        (form.elements.namedItem("title") as HTMLElement | null)?.focus();
        return;
      }
      router.push(`/projects/${slug}/discussions/${payload.id}`);
      router.refresh();
    } catch {
      setError("Could not create discussion. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form aria-busy={submitting} className={styles.discussionForm} noValidate onSubmit={submit}>
      <Stack className={styles.discussionCreateFields} gap={4}>
        <Field description="Required · 1–200 characters" error={fieldErrors.title} id="discussion-title" invalid={Boolean(fieldErrors.title)} label="Title" required>
          <Input autoComplete="off" maxLength={200} name="title" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required />
        </Field>
        <Field description="Up to 10,000 characters" error={fieldErrors.body} id="discussion-body" invalid={Boolean(fieldErrors.body)} label="Body (optional)">
          <Textarea maxLength={10000} name="body" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.body; return next; })} rows={6} />
        </Field>
        {error && <Banner title="Could not create discussion" tone="error">{error}</Banner>}
        {submitting && <Banner title="Creating discussion" tone="info">Your discussion is being saved.</Banner>}
        <p className={styles.discussionPrivacy}>Everyone who can view this project can read the discussion.</p>
        <div className={styles.discussionActions}>
          <Link className={styles.discussionCancel} href={`/projects/${slug}#discussions`}>Cancel</Link>
          <Button loading={submitting} loadingLabel="Creating discussion" size="lg" type="submit">Create discussion</Button>
        </div>
      </Stack>
  </form>;
}

export function DiscussionCommentForm({ discussionId, slug }: { discussionId: string; slug: string }) {
  const router = useRouter();
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const parsed = discussionCommentSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a comment.");
      (form.elements.namedItem("body") as HTMLElement | null)?.focus();
      return;
    }
    setFieldError("");
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/discussions/${discussionId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setError(payload?.error ?? "Could not add comment. Try again.");
        (form.elements.namedItem("body") as HTMLElement | null)?.focus();
        return;
      }
      form.reset();
      setSuccess("Comment added.");
      router.refresh();
    } catch {
      setError("Could not add comment. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form aria-busy={submitting} className={`${styles.discussionForm} ${styles.discussionCommentForm}`} noValidate onSubmit={submit}>
    <Stack className={styles.discussionCommentFields} gap={4}>
      <h3>Add a comment</h3>
      <Field error={fieldError} id="discussion-comment" invalid={Boolean(fieldError)} label="Comment" required>
        <Textarea maxLength={10000} name="body" onChange={() => setFieldError("")} required rows={4} />
      </Field>
      {error && <Banner title="Could not add comment" tone="error">{error}</Banner>}
      {success && <Banner title="Comment added" tone="success">{success}</Banner>}
      {submitting && <Banner title="Adding comment" tone="info">Your comment is being saved.</Banner>}
      <Button loading={submitting} loadingLabel="Adding comment" size="lg" type="submit">Add comment</Button>
    </Stack>
  </form>;
}

type WorkKind = "ISSUE" | "DESIGN_REQUEST";

export function DiscussionWorkForm({ canCreateDesignRequest, discussionBody, discussionId, discussionTitle, slug }: {
  canCreateDesignRequest: boolean;
  discussionBody: string;
  discussionId: string;
  discussionTitle: string;
  slug: string;
}) {
  const router = useRouter();
  const actionGroup = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<WorkKind | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function openForm(nextKind: WorkKind) {
    setKind(nextKind);
    setFieldErrors({});
    setError("");
    setSuccess("");
  }

  function closeForm() {
    if (!kind || submitting) return;
    const action = actionGroup.current?.querySelector<HTMLButtonElement>(`[data-work-kind="${kind}"]`);
    setKind(null);
    action?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind || submitting) return;
    const form = event.currentTarget;
    const parsed = issueSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(({ path, message }) => [String(path[0]), message])));
      const first = parsed.error.issues[0]?.path[0];
      if (first) (form.elements.namedItem(String(first)) as HTMLElement | null)?.focus();
      return;
    }
    setFieldErrors({});
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${slug}/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) {
        setError(payload?.error ?? `Could not create ${kind === "ISSUE" ? "issue" : "design request"}. Try again.`);
        (form.elements.namedItem("title") as HTMLElement | null)?.focus();
        return;
      }
      setSuccess(`${kind === "ISSUE" ? "Issue" : "Design request"} created.`);
      router.refresh();
    } catch {
      setError(`Could not create ${kind === "ISSUE" ? "issue" : "design request"}. Try again.`);
    } finally {
      setSubmitting(false);
    }
  }

  return <section aria-labelledby="create-work-heading" className={styles.discussionWorkCreate}>
    <h2 id="create-work-heading">Create work from this discussion</h2>
    <div className={styles.discussionWorkActions} ref={actionGroup}>
      <Button data-work-kind="ISSUE" disabled={submitting} onClick={() => openForm("ISSUE")} size="lg" type="button" variant="secondary">Create issue</Button>
      {canCreateDesignRequest && <Button data-work-kind="DESIGN_REQUEST" disabled={submitting} onClick={() => openForm("DESIGN_REQUEST")} size="lg" type="button" variant="secondary">Create design request</Button>}
    </div>
    {kind && <Panel className={styles.discussionWorkFormPanel}>
      <form aria-busy={submitting} aria-labelledby="create-work-form-heading" className={styles.discussionForm} noValidate onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeForm(); } }} onSubmit={(event) => { void submit(event); }}>
        <Stack gap={4}>
          <h3 id="create-work-form-heading">Create {kind === "ISSUE" ? "issue" : "design request"}</h3>
          <p className={styles.discussionMeta}>From discussion: {discussionTitle}</p>
          <input name="kind" type="hidden" value={kind} />
          <input name="sourceDiscussionId" type="hidden" value={discussionId} />
          <Field error={fieldErrors.title} id="derived-work-title" invalid={Boolean(fieldErrors.title)} label="Title" required>
            <Input autoComplete="off" defaultValue={discussionTitle} maxLength={200} name="title" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required />
          </Field>
          <Field error={fieldErrors.body} id="derived-work-body" invalid={Boolean(fieldErrors.body)} label="Body">
            <Textarea defaultValue={discussionBody} maxLength={10000} name="body" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.body; return next; })} rows={5} />
          </Field>
          {error && <Banner title="Could not create work" tone="error">{error}</Banner>}
          {success && <Banner title="Work created" tone="success">{success}</Banner>}
          {submitting && <Banner title="Creating work" tone="info">Your work item is being saved.</Banner>}
          <div className={styles.discussionWorkFormActions}>
            <Button disabled={submitting} loading={submitting} loadingLabel="Creating work" type="submit">Create {kind === "ISSUE" ? "issue" : "design request"}</Button>
            <Button disabled={submitting} onClick={closeForm} type="button" variant="ghost">Cancel</Button>
          </div>
        </Stack>
      </form>
    </Panel>}
  </section>;
}
