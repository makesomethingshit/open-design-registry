"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { FormColumn, PageGrid, PageHeader, Panel, Stack } from "@/src/components/ui/layout";

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
    setSubmitting(true);
    try {
      const response = await fetch("/api/projects", { method: "POST", body: new FormData(formElement) });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "Could not create project.");
        return;
      }
      router.push(`/projects/${(await response.json()).slug}`);
    } catch {
      setError("Could not create project. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <PageGrid aria-labelledby="new-project-heading">
    <FormColumn>
      <Panel>
        <PageHeader id="new-project-heading" title="Create a project" description="Register a design project and confirm your rights to publish its source." />
        <form className="form" noValidate onSubmit={submit} aria-busy={submitting}>
          <Stack gap={4}>
            <Field error={fieldErrors.title} id="project-title" invalid={Boolean(fieldErrors.title)} label="Title" required><Input name="title" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required maxLength={120} /></Field>
            <Field error={fieldErrors.description} id="project-description" invalid={Boolean(fieldErrors.description)} label="Description"><Textarea name="description" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.description; return next; })} maxLength={2000} /></Field>
            <Field error={fieldErrors.license} id="project-license" invalid={Boolean(fieldErrors.license)} label="License"><Select name="license" defaultValue="CC BY 4.0" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.license; return next; })}><option>CC BY 4.0</option><option>CC BY-SA 4.0</option><option>CC0 1.0</option><option>MIT</option></Select></Field>
            <Field error={fieldErrors.cover} id="project-cover" invalid={Boolean(fieldErrors.cover)} label="Cover image (PNG/JPG, up to 10 MB)" required><Input name="cover" type="file" accept="image/png,image/jpeg" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.cover; return next; })} required /></Field>
            <Checkbox defaultChecked label="Public project" name="isPublic" />
            <Checkbox label="I have the right to publish this work under the selected license and accept responsibility for sharing its source." name="rightsConfirmed" />
            {error && <Banner tone="error" title="Could not create project">{error}</Banner>}
            <Button loading={submitting} loadingLabel="Creating project" type="submit">Create project</Button>
          </Stack>
        </form>
      </Panel>
    </FormColumn>
  </PageGrid>;
}
