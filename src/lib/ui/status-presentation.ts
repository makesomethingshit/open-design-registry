import type { ChangeReviewStatusValue, ProposalStatusValue } from "@/src/lib/proposal-status";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
export type StatusIcon = "clock" | "check" | "warning" | "close";

export type StatusPresentation = Readonly<{ label: string; tone: StatusTone; icon: StatusIcon }>;

const proposalPresentations: Record<ProposalStatusValue, StatusPresentation> = {
  DRAFT: { label: "Draft", tone: "neutral", icon: "clock" },
  OPEN: { label: "Open", tone: "neutral", icon: "clock" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning", icon: "warning" },
  APPROVED: { label: "Approved", tone: "success", icon: "check" },
  PARTIALLY_ACCEPTED: { label: "Partially applied", tone: "accent", icon: "check" },
  ACCEPTED: { label: "Applied", tone: "accent", icon: "check" },
  CLOSED: { label: "Closed", tone: "neutral", icon: "close" },
};

const changeReviewPresentations: Record<ChangeReviewStatusValue, StatusPresentation> = {
  PENDING: { label: "Pending review", tone: "neutral", icon: "clock" },
  APPROVED: { label: "Approved", tone: "success", icon: "check" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning", icon: "warning" },
};

const unknownPresentation: StatusPresentation = { label: "Unknown status", tone: "neutral", icon: "warning" };

export function proposalStatusPresentation(status: string, appliedCount?: number, totalCount?: number): StatusPresentation {
  const presentation = proposalPresentations[status as ProposalStatusValue] ?? unknownPresentation;
  if (status === "PARTIALLY_ACCEPTED" && Number.isInteger(appliedCount) && Number.isInteger(totalCount)) {
    return { ...presentation, label: `Partially applied · ${appliedCount}/${totalCount}` };
  }
  return presentation;
}

export function changeReviewStatusPresentation(status: string, appliedRevisionNumber?: number | null): StatusPresentation {
  if (typeof appliedRevisionNumber === "number") {
    return { label: `Applied · r${appliedRevisionNumber}`, tone: "accent", icon: "check" };
  }
  return changeReviewPresentations[status as ChangeReviewStatusValue] ?? unknownPresentation;
}
