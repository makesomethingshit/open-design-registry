# Contributor Canvas A — membership and ACL (#130)

**Status: UI and API implemented; final browser validation is in progress.** Discussions includes the Canvas application and management area, and each Canvas has an extensible detail route. Skipped or failed E2E is not completion evidence.

## Invariants
- One row per `(projectId, ownerId)`, regardless of reapplications. Approval is not Proposal/Revision acceptance.
- First approval is durable (`firstApprovedAt`); revoked/reapplying prior public content remains publicly readable while project is public, but never writable/commentable.
- First-time PENDING/REJECTED applications are only visible to applicant and Project owner; project-private Canvas is not surfaced.
- A previously approved Canvas remains publicly readable and read-only after revocation, including while a reapplication is pending or rejected. Visitors see the retained history and first-approval date, not the private request state.
- First-time pending/rejected applications stay out of public lists and projections. The applicant and Project owner see the state and private-application notice. Public projections expose the owner's display name and first-approval history, never owner IDs, email, or private request state.
- Project owner approves/revokes, but cannot edit another designer's items.
- Mutations must re-check Project public status + current Canvas status under the same transactional lock; policy helpers are *not* an authorization substitute.

## Remaining to make #130 ready
- [x] Application, list/detail and moderation route handlers; explicit 401/403/404/409 and idempotency contracts
- [x] Transactional state transitions and duplicate/concurrent request tests on PostgreSQL (execution results must be recorded separately)
- [x] Discussions → Canvases UI with application, approval/rejection, withdrawal/revocation/reapplication, and an empty detail slot
- [ ] 320/390px browser layout and keyboard-operated membership workflow
- [ ] Verify generated Prisma client, migration and CI on this exact branch

## API and retention
- `GET/POST /api/projects/:slug/canvases`: list visible Canvases or apply. Repeated PENDING/APPROVED applications return the existing row; reapplication preserves first approval history.
- `GET/PATCH /api/projects/:slug/canvases/:canvasId`: read or send `{action: "approve" | "reject" | "revoke" | "withdraw"}`. Only the Project owner moderates; only the Canvas owner withdraws. Competing approve/reject requests yield one success and one 409.
- Writes lock Project before Canvas and re-read ownership/visibility/status after acquiring locks. Project visibility updates and ownership changes therefore serialize with Canvas writes.
- Contributor account deletion sets Canvas ownership to NULL. Previously public work stays readable; first-time applications remain hidden. Anonymous ownership never grants anonymous access or editing. Item/comment author retention is added by B/C.
- Explicit Project deletion follows the existing Project lifecycle and deletes its Canvases. Account deletion is blocked while the user owns a Project with previously approved Canvas history: transfer Project ownership first. This prevents indirect deletion of other contributors' work. The guard also covers currently private Projects with prior public history. No account-deletion or ownership-transfer UI is introduced here.
- The detail extension point is the `children` slot on `CanvasDetail` in `app/projects/[slug]/canvases/canvas-membership.tsx`; item and comment components mount there with `slug`, `canvasId`, and their capability flag.
- Stack order remains #166 → #167 → #168. Retarget each successor only after its predecessor merges; local work does not authorize merging or a Ready transition.
