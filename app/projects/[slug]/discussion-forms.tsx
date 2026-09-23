"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Textarea } from "@/src/components/ui/field";
import { Stack } from "@/src/components/ui/layout";
import { discussionCommentSchema, discussionSchema } from "@/src/lib/discussion-validation";
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
