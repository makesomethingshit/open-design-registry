"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { Stack } from "@/src/components/ui/layout";
import { projectActivityStatusLabel, projectActivityStatuses, type ProjectActivityStatus } from "@/src/lib/project-activity-status";

export default function ProjectSettingsForm({ slug, title, description, license, isPublic, activityStatus }: { slug: string; title: string; description: string; license: string; isPublic: boolean; activityStatus: ProjectActivityStatus }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

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
      const response = await fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), description: form.get("description"), license: form.get("license"), isPublic: form.get("isPublic") === "on", activityStatus: form.get("activityStatus"), rightsConfirmed: form.get("rightsConfirmed") === "on" }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "프로젝트를 저장하지 못했습니다.");
        return;
      }
      setSuccess("프로젝트 설정을 저장했습니다.");
      router.refresh();
    } catch {
      setError("프로젝트를 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="project-settings">
    <summary>프로젝트 설정</summary>
    <form className="form" noValidate onSubmit={submit} aria-busy={saving}>
      <Stack gap={4}>
        <Field error={fieldErrors.title} id="settings-title" invalid={Boolean(fieldErrors.title)} label="제목" required><Input name="title" defaultValue={title} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.title; return next; })} required maxLength={120} /></Field>
        <Field error={fieldErrors.description} id="settings-description" invalid={Boolean(fieldErrors.description)} label="설명"><Textarea name="description" defaultValue={description} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.description; return next; })} maxLength={2000} /></Field>
        <Field error={fieldErrors.license} id="settings-license" invalid={Boolean(fieldErrors.license)} label="라이선스" required><Input name="license" defaultValue={license} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.license; return next; })} required maxLength={80} /></Field>
        <Field id="settings-activity-status" label="Activity status"><Select defaultValue={activityStatus} name="activityStatus">{Object.values(projectActivityStatuses).map((status) => <option key={status} value={status}>{projectActivityStatusLabel(status)}</option>)}</Select></Field>
        <Checkbox defaultChecked={isPublic} label="공개 프로젝트" name="isPublic" />
        {!isPublic && <Checkbox label="공개 전 원본 공개 권리를 확인했습니다." name="rightsConfirmed" />}
        {error && <Banner tone="error" title="저장 실패">{error}</Banner>}
        {success && <Banner tone="success" title="저장 완료">{success}</Banner>}
        <Button loading={saving} loadingLabel="저장 중" type="submit">설정 저장</Button>
      </Stack>
    </form>
  </details>;
}
