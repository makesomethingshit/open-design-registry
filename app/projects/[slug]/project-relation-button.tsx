"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Banner } from "@/src/components/ui/banner";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import styles from "./project-relation-button.module.css";

const relationConfig = {
  star: {
    icon: "star",
    loadingLabel: "Saving…",
    pendingLabel: "Saving…",
    activeLabel: "Starred",
    inactiveLabel: "Star",
    variant: "secondary",
    activeAnnouncement: "Added to Starred projects.",
    inactiveAnnouncement: "Removed from Starred projects.",
    errorTitle: "Could not save this project. Please try again.",
  },
  watch: {
    icon: "bell",
    loadingLabel: "Saving watch state",
    pendingLabel: "Saving...",
    activeLabel: "Watching",
    inactiveLabel: "Watch",
    variant: "primary",
    activeAnnouncement: "Watching this project. You will be notified of new revisions and releases.",
    inactiveAnnouncement: "Stopped watching this project.",
    errorTitle: "Could not update the watch. Please try again.",
  },
} as const;

type ProjectRelation = keyof typeof relationConfig;

export function ProjectRelationButton({ relation, initialActive, signedIn, slug }: { relation: ProjectRelation; initialActive: boolean; signedIn: boolean; slug: string }) {
  const config = relationConfig[relation];
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const requestInFlight = useRef(false);

  async function toggle() {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    const nextActive = !active;
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(slug)}/${relation}`, { method: nextActive ? "PUT" : "DELETE" });
      if (!response.ok) throw new Error(`${relation} update failed`);
      setActive(nextActive);
      setAnnouncement(nextActive ? config.activeAnnouncement : config.inactiveAnnouncement);
    } catch {
      setFailed(true);
    } finally {
      requestInFlight.current = false;
      setPending(false);
    }
  }

  return <div className={styles.control}>
    {signedIn
      ? <Button aria-pressed={active} loading={pending} loadingLabel={config.loadingLabel} onClick={toggle} size="lg" variant={config.variant}>{!pending && <Icon name={config.icon} />}{pending ? config.pendingLabel : active ? config.activeLabel : config.inactiveLabel}</Button>
      : <Link className={styles.loginLink} href={`/login?next=${encodeURIComponent(`/projects/${slug}`)}`}><Icon name={config.icon} /><span>{config.inactiveLabel}</span></Link>}
    {failed && <Banner className={styles.errorBanner} title={config.errorTitle} tone="error" />}
    <span aria-live="polite" className="sr-only">{announcement}</span>
  </div>;
}
