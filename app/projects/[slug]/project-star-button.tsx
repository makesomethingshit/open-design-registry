"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import styles from "./project-star-button.module.css";

type ProjectStarButtonProps = { initialStarred: boolean; signedIn: boolean; slug: string };

export function ProjectStarButton({ initialStarred, signedIn, slug }: ProjectStarButtonProps) {
  const [starred, setStarred] = useState(initialStarred);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const requestInFlight = useRef(false);

  async function toggleStar() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const nextStarred = !starred;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(slug)}/star`, { method: nextStarred ? "PUT" : "DELETE" });
      if (!response.ok) throw new Error("Star update failed");
      setStarred(nextStarred);
      setAnnouncement(nextStarred ? "Added to Starred projects." : "Removed from Starred projects.");
    } catch {
      setFailed(true);
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  return <div className={styles.control}>
    {signedIn
      ? <Button aria-pressed={starred} loading={pending} loadingLabel="Saving…" onClick={toggleStar} size="lg" variant="secondary">{!pending && <Icon name="star" />}{pending ? "Saving…" : starred ? "Starred" : "Star"}</Button>
      : <Link className={styles.loginLink} href={`/login?next=${encodeURIComponent(`/projects/${slug}`)}`}><Icon name="star" /><span>Star</span></Link>}
    {failed && <Banner className={styles.errorBanner} title="Could not save this project. Please try again." tone="error" />}
    <span aria-live="polite" className="sr-only">{announcement}</span>
  </div>;
}
