"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import styles from "./project.module.css";

type Props = { slug: string; title: string; description: string; license: string; activityStatus: string; isOwner: boolean };

export default function ProjectAbout({ slug, title, description, license, activityStatus, isOwner }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: values.get("title"), description: values.get("description"), license: values.get("license"), activityStatus: values.get("activityStatus") }) });
      if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "Could not save About."); return; }
      setEditing(false); setMessage("About saved."); router.refresh(); heading.current?.focus();
    } catch { setError("Could not save About. Try again."); }
    finally { setSaving(false); }
  }
  return <section>
    <header className={styles.aboutHeader}><div><p className={styles.eyebrow}>Project information</p><h2 id="overview-heading" ref={heading} tabIndex={-1}>About</h2></div>{isOwner && !editing && <Button onClick={() => { setEditing(true); setError(""); setMessage(""); }} size="sm" variant="secondary">Edit About</Button>}</header>
    {editing ? <form aria-label="Edit About" aria-busy={saving} className={styles.aboutForm} onSubmit={save}>
      <Field id="about-title" label="Project title" required><Input autoFocus defaultValue={title} disabled={saving} maxLength={120} name="title" required /></Field>
      <Field id="about-description" label="Short description"><Textarea defaultValue={description} disabled={saving} maxLength={2000} name="description" rows={4} /></Field>
      <Field id="about-license" label="License" required><Input defaultValue={license} disabled={saving} maxLength={80} name="license" required /></Field>
      <Field id="about-activity" label="Activity status"><Select defaultValue={activityStatus} disabled={saving} name="activityStatus"><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option></Select></Field>
      {error && <p role="alert">{error}</p>}
      <div className={styles.editActions}><Button disabled={saving} onClick={() => { setEditing(false); heading.current?.focus(); }} variant="secondary">Cancel About changes</Button><Button loading={saving} type="submit">Save About</Button></div>
    </form> : description ? <p className={styles.prose}>{description}</p> : <p className={styles.muted}>No project description has been added.</p>}
    {message && <p className={styles.muted} role="status">{message}</p>}
  </section>;
}
