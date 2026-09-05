"use client";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Choice } from "../contribution-form";

type Props = { slug: string; id: string; version: number; status: string; signedIn: boolean; canReview: boolean; canUpdate: boolean; stale: boolean; licenseMatches: boolean; latestId?: string; latestNumber?: number; choices: Choice[] };
export default function ContributionActions(props: Props) {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const open = props.status === "OPEN" || props.status === "CHANGES_REQUESTED";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const element = event.currentTarget;
    const form = new FormData(element);
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "comment";
    const payload: Record<string, unknown> = { action, body: form.get("body") ?? "" };
    if (action !== "comment") payload.expectedVersion = props.version;
    if (action === "accept" || action === "update") payload.rightsConfirmed = form.get("rightsConfirmed") === "on";
    if (action === "update") { payload.proposedRevisionId = form.get("proposedRevisionId"); payload.baseRevisionId = props.latestId; }
    try {
      const response = await fetch(`/api/projects/${props.slug}/contributions/${props.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Could not save this action"); return; }
      element.reset(); router.refresh(); window.dispatchEvent(new Event("notifications-state-changed"));
    } catch { setError("Could not save this action. Reload the discussion before retrying."); }
    finally { setBusy(false); }
  }
  return <div className="contribution-actions">
    {props.signedIn && <form className="form" onSubmit={submit}><label>Comment<textarea name="body" required maxLength={10000} /></label><button className="button secondary" value="comment" disabled={busy}>Add comment</button></form>}
    {props.canUpdate && open && props.latestId && <form className="form" onSubmit={submit} aria-label="Resubmit proposal">
      <h2>Update your proposal</h2><label>Updated revision<select name="proposedRevisionId" required>{props.choices.map((choice) => <option value={choice.id} key={choice.id}>{choice.label}</option>)}</select></label>
      <label>Update explanation<textarea name="body" required maxLength={10000} /></label>
      <label className="checkbox"><input name="rightsConfirmed" type="checkbox" required />I have compared my proposal with current project Revision {props.latestNumber} and confirm my rights to publish it.</label>
      <button className="button" value="update" disabled={busy || !props.choices.length}>Resubmit proposal</button>
    </form>}
    {props.canReview && open && <>
      <form className="form" onSubmit={submit} aria-label="Review proposal"><h2>Review this proposal</h2><label>Review explanation<textarea name="body" required maxLength={10000} /></label><div className="contribution-buttons"><button className="button secondary" value="request_changes" disabled={busy}>Request changes</button><button className="button secondary" value="reject" disabled={busy}>Reject proposal</button></div></form>
      <form className="form" onSubmit={submit} aria-label="Accept proposal"><h2>Accept into the project</h2>
        <p>Publish the complete proposed design as the next project revision. Earlier revisions and this review remain in the history.</p>
        {props.stale && <p role="status">The project changed since this proposal was prepared. Ask the author to compare and resubmit against Revision {props.latestNumber}.</p>}
        {!props.licenseMatches && <p role="status">The proposal and project licenses must match before acceptance.</p>}
        {props.status === "CHANGES_REQUESTED" && <p role="status">Waiting for the author to resubmit requested changes.</p>}
        <label className="checkbox"><input name="rightsConfirmed" type="checkbox" required />I have reviewed the proposed files and license and confirm their publication.</label>
        <button className="button" value="accept" disabled={busy || props.stale || !props.licenseMatches || props.status !== "OPEN"}>Accept proposal</button>
      </form>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
