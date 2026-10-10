"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextLink } from "@/src/components/ui/button";
import styles from "./participation-control.module.css";

type ParticipationControlProps = { issueId: string; count: number; names: string[]; participating: boolean; signedIn: boolean; loginHref: string };

export default function ParticipationControl({ issueId, count: initialCount, names: initialNames, participating: initialParticipating, signedIn, loginHref }: ParticipationControlProps) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [names, setNames] = useState(initialNames);
  const [participating, setParticipating] = useState(initialParticipating);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setCount(initialCount); setNames(initialNames); setParticipating(initialParticipating); }, [initialCount, initialNames, initialParticipating]);

  async function toggle() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/issues/${encodeURIComponent(issueId)}/participation`, { method: participating ? "DELETE" : "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setError(response.status === 409 ? "This request is closed." : payload?.error ?? "Could not update participation.");
        if (response.status === 409) router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Could not update participation. Try again.");
    } finally {
      setPending(false);
    }
  }

  const remaining = Math.max(0, count - names.length);
  const summary = count === 0 ? "No one is working on this yet." : `${count} ${count === 1 ? "person is" : "people are"} working on this${names.length ? `: ${names.join(", ")}${remaining ? ` and ${remaining} more` : ""}` : ""}.`;

  return <section aria-labelledby="participation-heading" className={styles.participation}>
    <h2 className={styles.heading} id="participation-heading">Working interest</h2>
    <p className={styles.summary} aria-live="polite">{summary}</p>
    {signedIn ? <>
      <p className={styles.notice}>Your display name will be visible to visitors. This signals interest only; it does not reserve the request or assign work.</p>
      <div className={styles.actions}>
        <Button loading={pending} loadingLabel={participating ? "Stopping" : "Joining"} onClick={toggle} variant={participating ? "secondary" : "primary"}>{participating ? "Stop working on this" : "Working on this"}</Button>
      </div>
    </> : <p className={styles.notice}>Sign in to say you’re working on this. You’ll return here without joining automatically. <TextLink href={loginHref}>Sign in to participate</TextLink></p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
