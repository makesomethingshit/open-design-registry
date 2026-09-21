"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Field, Input } from "@/src/components/ui/field";
import { focusFirstInvalid, invalidFieldErrors } from "@/src/components/ui/form";
import { FormColumn, PageGrid, PageHeader, Panel, Stack } from "@/src/components/ui/layout";

export function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");

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
    const data = Object.fromEntries(new FormData(formElement));
    const endpoint = mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) {
        setError((await response.json().catch(() => null))?.message ?? "요청을 처리하지 못했습니다.");
        return;
      }
      window.dispatchEvent(new Event("auth-state-changed"));
      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("요청을 처리하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const signIn = mode === "sign-in";
  return <PageGrid aria-labelledby="login-heading">
    <FormColumn>
      <Panel>
        <PageHeader id="login-heading" title={signIn ? "로그인" : "계정 만들기"} description="Open Design Registry에 계속하려면 계정 정보를 입력하세요." />
        <form className="form" noValidate onSubmit={submit} aria-busy={submitting}>
          <Stack gap={4}>
            {!signIn && <Field error={fieldErrors.name} id="login-name" invalid={Boolean(fieldErrors.name)} label="이름" required><Input name="name" autoComplete="name" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.name; return next; })} required /></Field>}
            <Field error={fieldErrors.email} id="login-email" invalid={Boolean(fieldErrors.email)} label="이메일" required><Input type="email" name="email" autoComplete="email" onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.email; return next; })} required /></Field>
            <Field description="8자 이상 입력하세요." error={fieldErrors.password} id="login-password" invalid={Boolean(fieldErrors.password)} label="비밀번호" required><Input type="password" name="password" autoComplete={signIn ? "current-password" : "new-password"} minLength={8} onChange={() => setFieldErrors((current) => { const next = { ...current }; delete next.password; return next; })} required /></Field>
            {error && <Banner tone="error" title="요청을 처리하지 못했습니다.">{error}</Banner>}
            <Stack gap={2}>
              <Button loading={submitting} loadingLabel={signIn ? "로그인 중" : "가입 중"} type="submit">{signIn ? "로그인" : "가입하기"}</Button>
              <Button disabled={submitting} type="button" variant="secondary" onClick={() => { setError(""); setFieldErrors({}); setMode(signIn ? "sign-up" : "sign-in"); }}>{signIn ? "처음 오셨나요? 가입" : "이미 계정이 있어요"}</Button>
            </Stack>
          </Stack>
        </form>
      </Panel>
    </FormColumn>
  </PageGrid>;
}
