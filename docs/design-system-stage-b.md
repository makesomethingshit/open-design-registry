# Phase B handoff — ODR components and Proposal workspace

Phase A intentionally leaves the existing Proposal controller and API routes untouched. The next implementation should compose the Phase A primitives rather than recreate their CSS.

## Integration seams

- Build `DesignPreview` and `PreviewToolbar` from `Panel`, `SegmentedControl`, `Banner`, and the existing revision preview data. Preserve original media behavior; no image filters or invented metadata.
- Render proposal and change badges via `status-presentation.ts`. Continue to use `proposal-status.ts` and server responses for domain calculation.
- Replace repeated review-state markup in `app/proposals/[id]/proposal-review.tsx` with `ChangeItem`, `ReviewInspector`, and `ReviewActionBar` only after tracing its shared `viewedChangeId`, selection, mutation, and stale-check state.
- Keep review, select-for-apply, and apply as independent actions. Do not change the PATCH or POST payloads.
- Keep errors beside the current action and inside confirmation dialogs. Reuse native dialog focus behavior from Phase A.

## Verification target

Check ADD, MODIFY, REMOVE, RENAME, legacy replacement, stale invalidation, partial apply, network recovery, keyboard selection, private-source visibility, and the existing proposal tests before changing layout. No Prisma migration or client-side authorization move belongs in this phase.
