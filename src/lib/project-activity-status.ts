export const projectActivityStatuses = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
} as const;

export type ProjectActivityStatus = keyof typeof projectActivityStatuses;

export function projectActivityStatusLabel(status: ProjectActivityStatus) {
  return status[0] + status.slice(1).toLowerCase();
}
