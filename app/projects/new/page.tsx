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
        setError((await response.json().catch(() => null))?.error ?? "프로젝트를 만들지 못했습니다.");
        return;
      }
      router.push(`/projects/${(await response.json()).slug}`);
    } catch {
      setError("프로젝트를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return <PageGrid aria-labelledby="new-project-heading">
    <FormColumn>
      <Panel>
        <PageHeader id="new-project-heading" title="프로젝트 만들기" description="공개할 디자인 작업과 원본 권리를 함께 등록하세요." />
        <form className="form" noValidate onSubmit={submit} aria-busy={submitting}>
          <Stack gap={4}>
            <Field error={fieldErrors.title} id="project-title" invalid={Boolean(fieldErrors.title)} label="제목" required><Input name="title" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required maxLength={120} /></Field>
            <Field error={fieldErrors.description} id="project-description" invalid={Boolean(fieldErrors.description)} label="설명"><Textarea name="description" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.description; return next; })} maxLength={2000} /></Field>
            <Field error={fieldErrors.license} id="project-license" invalid={Boolean(fieldErrors.license)} label="라이선스"><Select name="license" defaultValue="CC BY 4.0" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.license; return next; })}><option>CC BY 4.0</option><option>CC BY-SA 4.0</option><option>CC0 1.0</option><option>MIT</option></Select></Field>
            <Field error={fieldErrors.cover} id="project-cover" invalid={Boolean(fieldErrors.cover)} label="대표 이미지 (PNG/JPG, 10MB 이하)" required><Input name="cover" type="file" accept="image/png,image/jpeg" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.cover; return next; })} required /></Field>
            <Checkbox defaultChecked label="공개 프로젝트" name="isPublic" />
            <Checkbox label="선택한 라이선스에 따라 공개할 권리가 있고, 원본 공개 책임을 이해했습니다." name="rightsConfirmed" />
            {error && <Banner tone="error" title="프로젝트를 만들지 못했습니다.">{error}</Banner>}
            <Button loading={submitting} loadingLabel="생성 중" type="submit">생성하기</Button>
          </Stack>
        </form>
      </Panel>
    </FormColumn>
  </PageGrid>;
}
