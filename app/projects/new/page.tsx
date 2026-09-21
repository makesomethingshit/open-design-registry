"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid } from "@/src/components/ui/form";
import { FormColumn, PageGrid, PageHeader, Panel, Stack } from "@/src/components/ui/layout";

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      focusFirstInvalid(event.currentTarget);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/projects", { method: "POST", body: new FormData(event.currentTarget) });
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
        <form className="form" onSubmit={submit} aria-busy={submitting}>
          <Stack gap={4}>
            <Field id="project-title" label="제목" required><Input name="title" required maxLength={120} /></Field>
            <Field id="project-description" label="설명"><Textarea name="description" maxLength={2000} /></Field>
            <Field id="project-license" label="라이선스"><Select name="license" defaultValue="CC BY 4.0"><option>CC BY 4.0</option><option>CC BY-SA 4.0</option><option>CC0 1.0</option><option>MIT</option></Select></Field>
            <Field id="project-cover" label="대표 이미지 (PNG/JPG, 10MB 이하)" required><Input name="cover" type="file" accept="image/png,image/jpeg" required /></Field>
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
