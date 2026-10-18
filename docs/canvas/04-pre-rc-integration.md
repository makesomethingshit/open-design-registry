# Contributor Canvas — pre-0.1 RC internal integration gate (#129)

This is a **developer integration checklist**, not an external user study or a declaration that the Epic is fully accepted. The three implementation PRs (#166, #167, #168) are merged. Keep #129 open until the checks are recorded on an exact main/RC-candidate SHA. External usability testing begins with the RC, not with each internal feature PR.

## Implemented contract to recheck

- Public Project → Discussions/Canvases; a Project owner approves or revokes each designer's independent Canvas. There is at most one Canvas per (Project, designer).
- The Canvas owner alone may create, move, resize, reorder and archive items while APPROVED. Other signed-in visitors may comment on active APPROVED items, but may never reposition another designer's items.
- Pan/zoom, fit/reset, keyboard and numeric placement, 320px/390px layout, and stable item-ID feedback history are part of the spatial MVP.
- An archived item keeps its author, provenance and existing comments. No new comments or layout writes are accepted on archived or revoked/reapplying history.
- Once-approved history remains readable on a still-public Project after REVOKED/reapplication; never-approved requests remain non-public. A private Project must not expose Canvas metadata or assets.
- Canvas is a mutable discussion aid, **not** a Proposal approval, immutable Revision or formal Contributor credit.

## Internal two-actor sequence (actual PostgreSQL and protected storage)

Record the exact application SHA, migration version, test DB/storage scope, test actor IDs (non-sensitive pseudonyms), run link and pass/fail evidence. Never attach real user assets, authentication state, credentials or browser traces.

| Step | Actor | Test and expected observable result |
| --- | --- | --- |
| 1 | Anonymous visitor | Read public Canvas list but cannot create, comment or access never-approved applications |
| 2 | Designer A / owner | A requests Canvas, owner approves, second request remains the same membership rather than making a duplicate |
| 3 | Designer B / owner | B obtains a separate approved Canvas; neither designer may move or archive items belonging to the other |
| 4 | A | Upload an original and a reference image and a text note; verify file type/size, authorship, source URL and rights metadata on reread |
| 5 | A | Move, resize and reorder items; reload both page and new session; geometry, stack, keyboard and numeric alternatives agree |
| 6 | B | Comment on A's active item; selection/reordering keeps feedback linked to the same `CanvasItem.id` |
| 7 | A | Archive or replace a reviewed item; old image attribution/comments remain readable; no new archive comments |
| 8 | Owner | Revoke A and verify read-only prior-public history; stale A tab cannot write or post new feedback |
| 9 | Owner / anonymous | Make Project private; all Canvas list, item, comment and protected asset routes enforce current visibility |
| 10 | A / owner | Reapply and reapprove; reuse the existing Canvas; verify existing archived feedback and attribution survive |

**Race and failure probes:** two writers with the same `layoutVersion` (one 409), simultaneous archive/comment and revoke/upload, a committed create/archive/comment with lost HTTP response, stale reload after replacement, two active pointers, >50 comments cursor pages, and PostgreSQL/MinIO object cleanup. A browser-only mock is not evidence for a database or S3 contention guarantee.

## Automation and manual boundary

- Run `npm test` with isolated `TEST_DATABASE_URL`, `npx tsc --noEmit`, `npm run build`, and `E2E_INTEGRATION=1 npm run test:e2e` against the same checked-out candidate SHA. CI already exercises Canvas membership, item/asset and spatial flows; compare **actual jobs, skips and checkout SHA**, not just a green badge.
- Inspect [Canvas membership](../../e2e/canvas-membership.integration.spec.ts), [item/storage](../../e2e/canvas-items.integration.spec.ts) and [spatial UI](../../e2e/canvas-spatial-ui.integration.spec.ts) alongside [PostgreSQL layout/comment regression](../../src/lib/canvas/feedback.integration.test.ts). These automated cases are not a substitute for a complete two-person manual session.
- **Deferred to one integrated RC usability study:** first-time designer comprehension, spatial interaction quality, readability of real design samples and navigation expectations. Physical touch hardware and screen-reader acceptance require separately recorded devices/software, because desktop viewport emulation does not establish either.

## Exit record (fill in after execution)

- SHA / environment / migration status: **Not yet recorded**
- Two-account integration result and protected image evidence: **Not yet recorded**
- DB/storage contention and latest CI links: **Not yet recorded**
- Outstanding P0/P1, regression issues and owners: **Not yet recorded**
- Decision: **#129 remains open until internal verification is complete; do not label this draft as proof of RC readiness.**
