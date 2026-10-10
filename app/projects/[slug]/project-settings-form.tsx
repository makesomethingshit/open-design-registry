"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { Stack } from "@/src/components/ui/layout";

const activityOptions = [
  { value: "ACTIVE", label: "Active — work is ongoing" },
  { value: "PAUSED", label: "Paused — work is temporarily on hold" },
  { value: "ARCHIVED", label: "Archived — kept for reference" },
] as const;

export default function ProjectSettingsForm({ slug, title, description, license, isPublic, activityStatus }: { slug: string; title: string; description: string; license: string; isPublic: boolean; activityStatus: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibilityChanged, setVisibilityChanged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      setFieldErrors(invalidFieldErrors(formElement));
      focusFirstInvalid(formElement);
      return;
    }
    setFieldErrors({});
    setError("");
    setSuccess("");
    setSaving(true);
    const form = new FormData(formElement);
    try {
      const response = await fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), description: form.get("description"), license: form.get("license"), ...(visibilityChanged ? { isPublic: form.get("isPublic") === "on" } : {}), activityStatus: form.get("activityStatus"), rightsConfirmed: form.get("rightsConfirmed") === "on" }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "Could not save project settings.");
        return;
      }
      setVisibilityChanged(false);
      setSuccess("Project settings saved.");
      router.refresh();
    } catch {
      setError("Could not save project settings. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return <section aria-label="Edit project settings" className="project-settings">
    <form className="form" noValidate onSubmit={submit} aria-busy={saving}>
      <Stack gap={4}>
        <Field error={fieldErrors.title} id="settings-title" invalid={Boolean(fieldErrors.title)} label="Title" required><Input name="title" defaultValue={title} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required maxLength={120} /></Field>
        <Field error={fieldErrors.description} id="settings-description" invalid={Boolean(fieldErrors.description)} label="Description"><Textarea name="description" defaultValue={description} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.description; return next; })} maxLength={2000} /></Field>
        <Field error={fieldErrors.license} id="settings-license" invalid={Boolean(fieldErrors.license)} label="License" required><Input name="license" defaultValue={license} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.license; return next; })} required maxLength={80} /></Field>
        <Field id="settings-activity-status" label="Activity status" description="This describes project activity. It does not affect proposals, search, or publishing."><Select name="activityStatus" defaultValue={activityStatus}>{activityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
        <Checkbox defaultChecked={isPublic} label="Public project" name="isPublic" onChange={() => setVisibilityChanged(true)} />
        {!isPublic && <Checkbox label="I confirm that I have the right to share the source publicly." name="rightsConfirmed" />}
        {error && <Banner tone="error" title="Could not save project settings">{error}</Banner>}
        {success && <Banner tone="success" title="Saved">{success}</Banner>}
        <Button loading={saving} loadingLabel="Saving settings" type="submit">Save settings</Button>
      </Stack>
    </form>
  </section>;
}
