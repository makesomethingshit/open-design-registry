"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectPage() {
  const router = useRouter(); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const response = await fetch("/api/projects", { method: "POST", body: new FormData(event.currentTarget) });
    if (response.status === 401) { router.push("/login"); return; }
    if (!response.ok) { setError((await response.json().catch(() => null))?.error ?? "프로젝트를 만들지 못했습니다."); return; }
    router.push(`/projects/${(await response.json()).slug}`);
  }
  return <section><h1>프로젝트 만들기</h1><form className="form" onSubmit={submit}><label>제목<input name="title" required maxLength={120} /></label><label>설명<textarea name="description" maxLength={2000} /></label><label>라이선스<select name="license" defaultValue="CC BY 4.0"><option>CC BY 4.0</option><option>CC BY-SA 4.0</option><option>CC0 1.0</option><option>MIT</option></select></label><label>대표 이미지 (PNG/JPG, 10MB 이하)<input name="cover" type="file" accept="image/png,image/jpeg" required /></label><label><span><input name="isPublic" type="checkbox" defaultChecked /> 공개 프로젝트</span></label><label className="consent"><span><input name="rightsConfirmed" type="checkbox" required /> 선택한 라이선스에 따라 공개할 권리가 있고, 원본 공개 책임을 이해했습니다.</span></label>{error && <p className="error">{error}</p>}<button className="button">생성하기</button></form></section>;
}
