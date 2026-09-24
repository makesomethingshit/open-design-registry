import type { StatusPresentation } from "./status-presentation";
import type { ProjectActivityStatusValue } from "@/src/lib/project-validation";

/**
 * Project activity status is a descriptive state only.
 *
 * PAUSED must not block proposals, ARCHIVED must not hide projects from
 * search, and neither may gate revision publishing. This module only maps
 * stored values to display labels — policy decisions stay out on purpose.
 * `Completed` / `Final` / `Stable` are rejected per docs/product-direction.md.
 */
const presentations: Record<ProjectActivityStatusValue, StatusPresentation> = {
  ACTIVE: { label: "Active", tone: "success", icon: "check" },
  PAUSED: { label: "Paused", tone: "warning", icon: "clock" },
  ARCHIVED: { label: "Archived", tone: "neutral", icon: "close" },
};

const unknownPresentation: StatusPresentation = { label: "Unknown status", tone: "neutral", icon: "warning" };

export function projectActivityStatusPresentation(status: string): StatusPresentation {
  return presentations[status as ProjectActivityStatusValue] ?? unknownPresentation;
}

export function isProjectActivityStatus(value: unknown): value is ProjectActivityStatusValue {
  return value === "ACTIVE" || value === "PAUSED" || value === "ARCHIVED";
}
