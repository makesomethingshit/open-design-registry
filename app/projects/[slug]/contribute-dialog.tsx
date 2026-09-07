"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import styles from "./contribute-dialog.module.css";

export default function ContributeDialog({ slug, revisionNumber, signedIn, initialIntent = "proposal" }: { slug: string; revisionNumber?: number; signedIn: boolean; initialIntent?: "proposal" | "fork" }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState(initialIntent);
  const unavailable = !revisionNumber;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  function start() {
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(`/projects/${slug}`)}`);
      return;
    }
    if (!unavailable) setOpen(true);
  }
  return <>
    <Button aria-describedby={unavailable ? "contribute-unavailable" : undefined} disabled={unavailable} onClick={start} size="lg" variant={initialIntent === "fork" ? "secondary" : "primary"}>{initialIntent === "fork" ? "Fork" : "Contribute"}</Button>
    {unavailable && <span id="contribute-unavailable" className="meta">Publish a revision before contributions can begin.</span>}
    <dialog ref={dialog} className="contribute-dialog" aria-labelledby="contribute-title" onClose={() => setOpen(false)} onCancel={() => setOpen(false)}>
      <form method="dialog" className="contribute-dialog-form" onSubmit={(event) => { event.preventDefault(); if (revisionNumber) router.push(`/projects/${slug}/revisions/${revisionNumber}?intent=${intent}`); setOpen(false); }}>
        <div className="section-heading"><h2 id="contribute-title">How do you want to work?</h2><Button aria-label="Close contribute dialog" onClick={() => setOpen(false)} size="lg" variant="secondary">Close</Button></div>
        <label className="intent-option"><input type="radio" name="intent" value="proposal" checked={intent === "proposal"} onChange={() => setIntent("proposal")} autoFocus /><span><strong>Propose a change</strong><small>Work on this project and send your changes back.</small></span></label>
        <label className="intent-option"><input type="radio" name="intent" value="fork" checked={intent === "fork"} onChange={() => setIntent("fork")} /><span><strong>Fork project</strong><small>Create an independent project from this revision.</small></span></label>
        <p className="meta">Starting from Revision {revisionNumber}</p>
        <div className={styles.actions}><Button onClick={() => setOpen(false)} size="lg" variant="secondary">Cancel</Button><Button size="lg" type="submit">{intent === "proposal" ? "Start a contribution" : "Fork project"}</Button></div>
      </form>
    </dialog>
  </>;
}
