# Contributor Canvas A — membership and ACL (#130)

**Status: DRAFT foundation only.** This PR adds the non-breaking Prisma model, migration and a pure policy/test seed. **No endpoints, screen, locking or production enforcement exist yet.** Do not merge as a completed Canvas feature.

## Invariants
- One row per `(projectId, ownerId)`, regardless of reapplications. Approval is not Proposal/Revision acceptance.
- First approval is durable (`firstApprovedAt`); revoked/reapplying prior public content remains publicly readable while project is public, but never writable/commentable.
- First-time PENDING/REJECTED applications are only visible to applicant and Project owner; project-private Canvas is not surfaced.
- Project owner approves/revokes, but cannot edit another designer's items.
- Mutations must re-check Project public status + current Canvas status under the same transactional lock; policy helpers are *not* an authorization substitute.

## Remaining to make #130 ready
- [ ] Application, list/detail and moderation route handlers; explicit 401/403/404/409 and idempotency contracts
- [ ] Transactional state transitions and duplicate/concurrent request tests on PostgreSQL
- [ ] Discussions → Canvases UI with application/approval/revocation and an empty detail
- [ ] 320/390px keyboard/accessibility checks; existing Discussion/Proposal regression
- [ ] Verify generated Prisma client, migration and CI on this exact branch
