import type { ProposalDraftChange } from "./proposal-form";

function validId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 200 ? value : null;
}

export function parseInitialChanges(value?: string): ProposalDraftChange[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((change): ProposalDraftChange[] => {
      if (!change || typeof change !== "object") return [];
      const value = change as Record<string, unknown>;
      const action = value.action;
      const targetFileId = validId(value.targetFileId);
      const sourceFileId = validId(value.sourceFileId);
      if (action === "MODIFY_UNIT" && targetFileId && sourceFileId) return [{ action, targetFileId, sourceFileId }];
      if (action === "REMOVE_UNIT" && targetFileId) return [{ action, targetFileId }];
      if (action === "ADD_UNIT" && sourceFileId) return [{ action, sourceFileId }];
      if (action === "RENAME_UNIT" && targetFileId && typeof value.newName === "string" && value.newName.length <= 200) return [{ action, targetFileId, newName: value.newName }];
      return [];
    });
  } catch {
    return [];
  }
}
