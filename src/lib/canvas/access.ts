/**
 * Canvas access policy draft (#130). The handlers must read current DB state
 * under the same project/canvas lock as any write. Never trust client snapshots.
 */
export type CanvasAccessStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";

export type CanvasAccessFacts = {
  projectPublic: boolean;
  projectOwnerId: string;
  canvasOwnerId: string | null;
  status: CanvasAccessStatus;
  /** Set once on first approval, never cleared by revocation/reapplication. */
  previouslyApproved: boolean;
};

export function mayReadCanvas(viewerId: string | null, facts: CanvasAccessFacts): boolean {
  if (!facts.projectPublic) return false;
  if (viewerId !== null && (viewerId === facts.projectOwnerId || viewerId === facts.canvasOwnerId)) return true;
  return facts.status === "APPROVED" || facts.previouslyApproved;
}

export function mayEditCanvas(viewerId: string | null, facts: CanvasAccessFacts): boolean {
  return facts.projectPublic && facts.status === "APPROVED" && viewerId !== null && viewerId === facts.canvasOwnerId;
}

export function mayManageCanvasApplications(viewerId: string | null, facts: Pick<CanvasAccessFacts, "projectPublic" | "projectOwnerId">): boolean {
  return facts.projectPublic && viewerId !== null && viewerId === facts.projectOwnerId;
}

export function mayCommentOnCanvas(viewerId: string | null, facts: CanvasAccessFacts): boolean {
  return facts.projectPublic && facts.status === "APPROVED" && viewerId !== null;
}
