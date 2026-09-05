export const proposalStatuses = ["DRAFT", "OPEN", "CHANGES_REQUESTED", "APPROVED", "PARTIALLY_ACCEPTED", "ACCEPTED", "CLOSED"] as const;
export const openProposalStatuses = ["OPEN", "CHANGES_REQUESTED", "APPROVED"] as const;
export type ProposalStatusValue = typeof proposalStatuses[number];
export type ChangeReviewStatusValue = "PENDING" | "APPROVED" | "CHANGES_REQUESTED";

export function proposalStatusForChanges(statuses: ChangeReviewStatusValue[]): ProposalStatusValue {
  if (statuses.length && statuses.every((status) => status === "APPROVED")) return "APPROVED";
  if (statuses.some((status) => status === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  return "OPEN";
}

export function proposalCanBeReviewed(status: ProposalStatusValue) {
  return ["OPEN", "CHANGES_REQUESTED", "APPROVED"].includes(status);
}
