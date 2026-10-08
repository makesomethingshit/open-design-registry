"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Icon } from "@/src/components/ui/icon";
import styles from "./contribute-dialog.module.css";

export default function ContributeDialog({ slug, revisionNumber, signedIn, initialIntent = "proposal" }: { slug: string; revisionNumber?: number; signedIn: boolean; initialIntent?: "proposal" | "fork" }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const unavailableId = useId();
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState(initialIntent);
  const unavailable = !revisionNumber;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      requestAnimationFrame(() => {
        if (element.open) element.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
      });
    }
    if (!open && element.open) {
      element.close();
      const target = returnFocus.current;
      returnFocus.current = null;
      target?.focus();
    }
  }, [open]);
  function start() {
    if (!signedIn) {
      const next = initialIntent === "proposal" ? `/projects/${slug}/contribute` : `/projects/${slug}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (initialIntent === "proposal") {
      if (!unavailable) router.push(`/projects/${slug}/contribute`);
      return;
    }
    if (!unavailable) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIntent(initialIntent);
      setOpen(true);
    }
  }
  return <>
    <Button aria-describedby={unavailable ? unavailableId : undefined} disabled={unavailable} onClick={start} size="lg" variant={initialIntent === "fork" ? "secondary" : "primary"}><Icon name={initialIntent === "fork" ? "fork" : "contribute"} />{initialIntent === "fork" ? "Fork" : "Contribute"}</Button>
    {unavailable && <span id={unavailableId} className="meta">Publish a revision before contributions can begin.</span>}
    <dialog ref={dialog} className="contribute-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
      <form method="dialog" className="contribute-dialog-form" onSubmit={(event) => { event.preventDefault(); if (revisionNumber) router.push(`/projects/${slug}/revisions/${revisionNumber}?intent=${intent}`); setOpen(false); }}>
        <div className="section-heading"><h2 id={titleId}>How do you want to work?</h2><Button aria-label="Close contribute dialog" onClick={() => setOpen(false)} size="lg" variant="secondary"><Icon name="close" />Close</Button></div>
        <label className="intent-option"><input type="radio" name="intent" value="proposal" checked={intent === "proposal"} onChange={() => setIntent("proposal")} /><span><strong>Propose a change</strong><small>Work on this project and send your changes back.</small></span></label>
        <label className="intent-option"><input type="radio" name="intent" value="fork" checked={intent === "fork"} onChange={() => setIntent("fork")} /><span><strong>Fork project</strong><small>Create an independent project from this revision.</small></span></label>
        <p className="meta">Starting from Revision {revisionNumber}</p>
        <div className={styles.actions}><Button onClick={() => setOpen(false)} size="lg" variant="secondary">Cancel</Button><Button size="lg" type="submit">{intent === "proposal" ? "Start a contribution" : "Fork project"}</Button></div>
      </form>
    </dialog>
  </>;
}
