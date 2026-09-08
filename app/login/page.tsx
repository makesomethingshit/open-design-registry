"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export default function LoginPage() {
  const router = useRouter(); const searchParams = useSearchParams(); const [error, setError] = useState(""); const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const data = Object.fromEntries(new FormData(event.currentTarget));
    const endpoint = mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!response.ok) { setError((await response.json().catch(() => null))?.message ?? "요청을 처리하지 못했습니다."); return; }
    window.dispatchEvent(new Event("auth-state-changed")); router.push(safeNextPath(searchParams.get("next"))); router.refresh();
  }
  return <section><h1>{mode === "sign-in" ? "로그인" : "계정 만들기"}</h1><form className="form" onSubmit={submit}>{mode === "sign-up" && <label>이름<input name="name" required /></label>}<label>이메일<input type="email" name="email" required /></label><label>비밀번호<input type="password" name="password" minLength={8} required /></label>{error && <p className="error">{error}</p>}<button className="button">{mode === "sign-in" ? "로그인" : "가입하기"}</button><button type="button" className="button secondary" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "처음 오셨나요? 가입" : "이미 계정이 있어요"}</button></form></section>;
}
