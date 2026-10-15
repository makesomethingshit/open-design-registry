# Contributor Canvas A — membership and ACL (#130)

**Status: DRAFT, backend implemented; UI acceptance remains pending.** Application/list/detail and moderation APIs enforce fresh PostgreSQL state. Do not merge as a completed Canvas feature until the remaining issue acceptance criteria are proven.

## Invariants
- One row per `(projectId, ownerId)`, regardless of reapplications. Approval is not Proposal/Revision acceptance.
- First approval is durable (`firstApprovedAt`); revoked/reapplying prior public content remains publicly readable while project is public, but never writable/commentable.
- First-time PENDING/REJECTED applications are only visible to applicant and Project owner; project-private Canvas is not surfaced.
- Project owner approves/revokes, but cannot edit another designer's items.
- Mutations must re-check Project public status + current Canvas status under the same transactional lock; policy helpers are *not* an authorization substitute.

## Remaining to make #130 ready
- [x] Application, list/detail and moderation route handlers; explicit 401/403/404/409 and idempotency contracts
- [x] Transactional state transitions and duplicate/concurrent request tests on PostgreSQL (execution results must be recorded separately)
- [ ] Discussions → Canvases UI with application/approval/revocation and an empty detail
- [ ] 320/390px keyboard/accessibility checks; existing Discussion/Proposal regression
- [ ] Verify generated Prisma client, migration and CI on this exact branch

## API and retention
- `GET/POST /api/projects/:slug/canvases`: list visible Canvases or apply. Repeated PENDING/APPROVED applications return the existing row; reapplication preserves first approval history.
- `GET/PATCH /api/projects/:slug/canvases/:canvasId`: read or send `{action: "approve" | "reject" | "revoke" | "withdraw"}`. Only the Project owner moderates; only the Canvas owner withdraws. Competing approve/reject requests yield one success and one 409.
- Writes lock Project before Canvas and re-read ownership/visibility/status after acquiring locks. Project visibility updates and ownership changes therefore serialize with Canvas writes.
- Contributor account deletion sets Canvas ownership to NULL. Previously public work stays readable; first-time applications remain hidden. Anonymous ownership never grants anonymous access or editing. Item/comment author retention is added by B/C.
- Project deletion follows the existing Project lifecycle and deletes its Canvases. Deleting a Project owner's account currently cascades through their Projects; preserving those Projects requires a separate Project ownership/account-deletion policy. No account-deletion UI is introduced here.
- Stack order remains #166 → #167 → #168. Retarget each successor only after its predecessor merges; local work does not authorize merging or a Ready transition.
