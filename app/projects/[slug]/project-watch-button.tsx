"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import styles from "./project-watch-button.module.css";

type ProjectWatchButtonProps = { initialWatched: boolean; signedIn: boolean; slug: string };

export function ProjectWatchButton({ initialWatched, signedIn, slug }: ProjectWatchButtonProps) {
  const [watched, setWatched] = useState(initialWatched);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const requestInFlight = useRef(false);

  async function toggleWatch() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const nextWatched = !watched;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(slug)}/watch`, { method: nextWatched ? "PUT" : "DELETE" });
      if (!response.ok) throw new Error("Watch update failed");
      setWatched(nextWatched);
      setAnnouncement(nextWatched ? "Watching this project. You will be notified of new revisions and releases." : "Stopped watching this project.");
    } catch {
      setFailed(true);
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  return <div className={styles.control}>
    {signedIn
      ? <Button aria-pressed={watched} loading={pending} loadingLabel="Saving watch state" onClick={toggleWatch} size="lg" variant="primary">{!pending && <Icon name="bell" />}{pending ? "Saving..." : watched ? "Watching" : "Watch"}</Button>
      : <Link className={styles.loginLink} href={`/login?next=${encodeURIComponent(`/projects/${slug}`)}`}><Icon name="bell" /><span>Watch</span></Link>}
    {failed && <Banner className={styles.errorBanner} title="Could not update the watch. Please try again." tone="error" />}
    <span aria-live="polite" className="sr-only">{announcement}</span>
  </div>;
}
