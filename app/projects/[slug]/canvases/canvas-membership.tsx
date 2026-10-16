"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import styles from "./canvas-membership.module.css";

export type CanvasView = {
  id: string;
  ownerName: string;
  accessStatus: "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  firstApprovedAt: string | null;
  isOwnCanvas: boolean;
  canEdit: boolean;
  canComment: boolean;
  canManage: boolean;
  canWithdraw: boolean;
  canReapply: boolean;
  layoutVersion?: number;
};

type Props = { slug: string; canvases: CanvasView[]; signedIn: boolean; isProjectOwner: boolean; embedded?: boolean };

export function CanvasMembership({ slug, canvases, signedIn, isProjectOwner, embedded = false }: Props) {
  const ownCanvas = canvases.find((canvas) => canvas.isOwnCanvas);
  return <section aria-labelledby="canvases-heading" className={`${styles.page}${embedded ? ` ${styles.embedded}` : ""}`} id={embedded ? "canvases" : undefined}>
    {!embedded && <nav aria-label="Project collaboration" className={styles.subnav}>
      <Link href={`/projects/${slug}/discussions`}>Discussions</Link>
      <Link aria-current="page" href={`/projects/${slug}/canvases`}>Canvases</Link>
    </nav>}
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Collaboration</p><h2 id="canvases-heading">Canvases</h2><p className={styles.intro}>Each designer has a separate Canvas. Approved work and its retained history stay readable; only an approved owner can edit their Canvas.</p></div>
      {!ownCanvas && (signedIn
        ? <CanvasAction slug={slug} label={isProjectOwner ? "Create my Canvas" : "Apply for a Canvas"} action="apply" primary />
        : <Link className={styles.primaryAction} href={`/login?next=${encodeURIComponent(`/projects/${slug}/discussions#canvases`)}`}>Sign in to apply</Link>)}
    </header>
    {canvases.length ? <ul className={styles.list}>{canvases.map((canvas) => <CanvasRow canvas={canvas} key={canvas.id} slug={slug} />)}</ul> : <p className={styles.muted}>{isProjectOwner ? "Create your Canvas or invite a designer to apply. No applications are waiting." : "No approved Canvases yet. Apply to start your own."}</p>}
  </section>;
}

function CanvasRow({ canvas, slug }: { canvas: CanvasView; slug: string }) {
  const publicHistory = !canvas.isOwnCanvas && canvas.firstApprovedAt !== null && canvas.accessStatus === "REVOKED";
  const privateApplication = canvas.firstApprovedAt === null && (canvas.accessStatus === "PENDING" || canvas.accessStatus === "REJECTED");
  const status = privateApplication
    ? `${canvas.accessStatus === "PENDING" ? "Awaiting approval" : "Application rejected"}. This private application is visible only to its owner and this project's owner.`
    : canvas.accessStatus === "APPROVED" ? "Approved"
      : canvas.accessStatus === "PENDING" ? "Reapplication pending - retained history remains public and read-only."
        : canvas.accessStatus === "REJECTED" ? "Reapplication rejected - retained history remains public and read-only."
          : publicHistory ? `Read-only public history - first approved ${date(canvas.firstApprovedAt!)}` : canvas.firstApprovedAt === null ? "Application withdrawn - no Canvas history is public." : "Access revoked - read-only";
  return <li className={styles.card}>
    <div className={styles.info}>
      <strong>{canvas.isOwnCanvas ? "Your Canvas" : `${canvas.ownerName}'s Canvas`}</strong>
      <span className={styles.meta}>{status}</span>
    </div>
    <div className={styles.actions}>
      <Link href={`/projects/${slug}/canvases/${canvas.id}`}>{canvas.canEdit ? "Edit Canvas" : canvas.isOwnCanvas ? "View your Canvas" : "View Canvas"}</Link>
      {canvas.canManage && canvas.accessStatus === "PENDING" && <><CanvasAction action="approve" canvasId={canvas.id} label="Approve" slug={slug} /><CanvasAction action="reject" canvasId={canvas.id} label="Reject" slug={slug} /></>}
      {canvas.canManage && canvas.accessStatus === "APPROVED" && <CanvasAction action="revoke" canvasId={canvas.id} label="Revoke access" slug={slug} />}
      {canvas.canWithdraw && <CanvasAction action="withdraw" canvasId={canvas.id} label={canvas.accessStatus === "APPROVED" ? "Withdraw access" : "Withdraw application"} slug={slug} />}
      {canvas.canReapply && <CanvasAction action="apply" label="Reapply" primary slug={slug} />}
    </div>
  </li>;
}

/** B/C detail components mount as children of this route-level slot. */
export function CanvasDetail({ slug, canvasId, canvas, children }: { slug: string; canvasId: string; canvas: CanvasView; children?: ReactNode }) {
  const publicHistory = !canvas.isOwnCanvas && canvas.firstApprovedAt !== null && canvas.accessStatus === "REVOKED";
  const privateApplication = canvas.firstApprovedAt === null && (canvas.accessStatus === "PENDING" || canvas.accessStatus === "REJECTED");
  const state = privateApplication
    ? `${canvas.accessStatus === "PENDING" ? "Awaiting approval" : "Application rejected"}. This private application is visible only to its owner and this project's owner.`
    : canvas.accessStatus === "APPROVED" ? "Approved. Only its owner can edit this Canvas."
      : canvas.accessStatus === "PENDING" ? "Reapplication pending. Retained history remains public and read-only."
        : canvas.accessStatus === "REJECTED" ? "Reapplication rejected. Retained history remains public and read-only."
          : publicHistory ? `Public read-only history - first approved ${date(canvas.firstApprovedAt!)}` : canvas.firstApprovedAt === null ? "Application withdrawn. No Canvas history is public." : "Read-only - access revoked";
  return <section aria-labelledby="canvas-detail-heading" className={`${styles.page} ${styles.detail}`}>
    <nav aria-label="Project collaboration" className={styles.subnav}>
      <Link href={`/projects/${slug}/discussions`}>Discussions</Link>
      <Link href={`/projects/${slug}/canvases`}>Canvases</Link>
    </nav>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Canvas - {canvas.ownerName}</p><h2 id="canvas-detail-heading">{canvas.isOwnCanvas ? "Your Canvas" : `${canvas.ownerName}'s Canvas`}</h2><p className={styles.intro}>{state}</p></div>
      <div className={styles.actions}>
        {canvas.canManage && canvas.accessStatus === "PENDING" && <><CanvasAction action="approve" canvasId={canvasId} label="Approve" slug={slug} /><CanvasAction action="reject" canvasId={canvasId} label="Reject" slug={slug} /></>}
        {canvas.canManage && canvas.accessStatus === "APPROVED" && <CanvasAction action="revoke" canvasId={canvasId} label="Revoke access" slug={slug} />}
        {canvas.canWithdraw && <CanvasAction action="withdraw" canvasId={canvasId} label={canvas.accessStatus === "APPROVED" ? "Withdraw access" : "Withdraw application"} slug={slug} />}
        {canvas.canReapply && <CanvasAction action="apply" label="Reapply" primary slug={slug} />}
      </div>
    </header>
    <div className={styles.slot}>{children ?? <p className={styles.muted}>No items yet.</p>}</div>
  </section>;
}

function CanvasAction({ slug, canvasId, action, label, primary = false }: { slug: string; canvasId?: string; action: "apply" | "approve" | "reject" | "revoke" | "withdraw"; label: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${slug}/canvases${canvasId ? `/${canvasId}` : ""}`, {
        method: action === "apply" ? "POST" : "PATCH",
        ...(action === "apply" ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }),
      });
      if (!response.ok) { setError(response.status === 409 ? "This Canvas changed. Refresh and try again." : "Could not update Canvas access. Try again."); return; }
      router.refresh();
    } catch { setError("Could not update Canvas access. Try again."); }
    finally { setBusy(false); }
  }
  const variant = primary || action === "apply" || action === "approve" ? "primary" : action === "reject" || action === "revoke" ? "danger" : "secondary";
  const loadingLabel = action === "apply" ? "Submitting application" : action === "approve" ? "Approving Canvas" : action === "reject" ? "Rejecting application" : action === "revoke" ? "Revoking Canvas access" : "Withdrawing Canvas access";
  return <>
    <Button loading={busy} loadingLabel={loadingLabel} onClick={() => { void submit(); }} size="lg" type="button" variant={variant}>{label}</Button>
    {error && <span className={styles.error} role="alert">{error}</span>}
  </>;
}

function date(value: string) { return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }); }
