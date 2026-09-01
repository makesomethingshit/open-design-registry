"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProjectSettingsForm({ slug, title, description, license, isPublic }: { slug: string; title: string; description: string; license: string; isPublic: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/projects/${slug}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), description: form.get("description"), license: form.get("license"), isPublic: form.get("isPublic") === "on", rightsConfirmed: form.get("rightsConfirmed") === "on" }) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.error ?? "프로젝트를 저장하지 못했습니다.");
        return;
      }
      router.refresh();
    } catch {
      setError("프로젝트를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="project-settings"><summary>프로젝트 설정</summary><form className="form" onSubmit={submit}><label>제목<input name="title" defaultValue={title} required maxLength={120} /></label><label>설명<textarea name="description" defaultValue={description} maxLength={2000} /></label><label>라이선스<input name="license" defaultValue={license} required maxLength={80} /></label><label><span><input name="isPublic" type="checkbox" defaultChecked={isPublic} /> 공개 프로젝트</span></label>{!isPublic && <label className="consent"><span><input name="rightsConfirmed" type="checkbox" /> 공개 전 원본 공개 권리를 확인했습니다.</span></label>}{error && <p className="error" role="alert">{error}</p>}<button className="button" disabled={saving}>{saving ? "저장 중…" : "설정 저장"}</button></form></details>;
}
