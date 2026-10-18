# Contributor Canvas — pre-0.1 RC internal integration gate (#129)

This is a **developer integration checklist**, not an external user study or a declaration that the Epic is fully accepted. The three implementation PRs (#166, #167, #168) are merged. Keep #129 open until the checks are recorded on an exact main/RC-candidate SHA. External usability testing begins with the RC, not with each internal feature PR.

## Implemented contract to recheck

- Public Project → Discussions/Canvases; a Project owner approves or revokes other designers' independent Canvases; the Project owner's own application is auto-approved. Anonymous visitors may read approved Canvases on a public Project. There is at most one Canvas per (Project, designer).
- The Canvas owner alone may create, move, resize, reorder and archive items while APPROVED. Other signed-in visitors may comment on active APPROVED items, but may never reposition another designer's items.
- Pan/zoom, fit/reset, keyboard and numeric placement, 320px/390px layout, and stable item-ID feedback history are part of the spatial MVP.
- An archived item preserves provenance and existing comments; deleted contributor accounts retain the content with anonymous attribution. Archived items reject new comments and cannot be layout-edit targets, although reordering another active item may renumber their stack positions. Revoked/reapplying history rejects new comments and layout edits.
- Once-approved history remains readable on a still-public Project after REVOKED/reapplication; never-approved requests remain non-public. A private Project must not expose Canvas metadata or assets.
- Canvas is a mutable discussion aid, **not** a Proposal approval, immutable Revision or formal Contributor credit.

## Internal two-actor sequence (actual PostgreSQL and protected storage)

Record the exact application SHA, migration version, test DB/storage scope, test actor IDs (non-sensitive pseudonyms), run link and pass/fail evidence. Never attach real user assets, authentication state, credentials or browser traces.

| Step | Actor | Test and expected observable result |
| --- | --- | --- |
| 1 | Anonymous visitor | Read public Canvas list but cannot create, comment or access never-approved applications |
| 2 | Designer A / owner | A requests Canvas, owner approves, second request remains the same membership rather than making a duplicate |
| 3 | Designer B / owner | B obtains a separate approved Canvas; neither designer may move or archive items belonging to the other |
| 4 | A | Upload an original and a reference image and a text note; verify file type/size, authorship, source URL and the contributor's displayed rights note on reread; the note does not grant permission or validate a license |
| 5 | A | Move, resize and reorder items; reload both page and new session; geometry, stack, keyboard and numeric alternatives agree |
| 6 | B | Comment on A's active item; selection/reordering keeps feedback linked to the same `CanvasItem.id` |
| 7 | A | Archive or replace a reviewed item; old image attribution/comments remain readable; no new archive comments |
| 8 | Owner | Revoke A and verify read-only prior-public history; stale A tab cannot write or post new feedback |
| 9 | Owner / anonymous | Make Project private; all Canvas list, item, comment and protected asset routes enforce current visibility |
| 10 | Owner / A | Owner makes the Project public again, then A reapplies and the owner approves. Reuse the existing Canvas; verify existing archived feedback and attribution survive. While the Project is private, reapplication/approval is expected to fail (404) and must not be recorded as a Canvas defect |
| 11 | A / B / owner, then anonymous | Keep the Project public after step 10. Record the approved Canvas ID, active and archived item IDs, comment IDs/bodies, image key/checksum, source URL and rights note. Include a comment authored by A as well as B. The repository has no user-facing or account API deletion flow; in the isolated migrated test database only, the test operator deletes contributor A (never the Project owner) with `prisma.user.delete({ where: { id: actorAId } })`, as the existing integration fixtures do. If the deletion guard rejects it, record **NOT TESTED / blocked**; do not claim a user flow exists or substitute the owner. Then reread the same IDs via the actual list/detail/comment/asset routes and browser. Content, image bytes, provenance and comments remain readable; A's Canvas/item/comment author references are null and the UI shows anonymous attribution without A's name. B's attribution remains intact. A's stale session cannot create, move, archive or comment; verify rejected requests leave rows and objects unchanged. Record each observation separately; a null Canvas owner ID alone is not a PASS. |

**Race and failure probes:** two writers with the same `layoutVersion` (one 409), simultaneous archive/comment and revoke/upload, a committed create/archive/comment with lost HTTP response, stale reload after replacement, pointer cancellation and a second pointer during a drag, >50 comments cursor pages, and PostgreSQL/MinIO object cleanup. A browser-only mock is not evidence for a database or S3 contention guarantee.

### Commit succeeded, response lost

Drop only the HTTP response after the production transaction commits; dropping a request before commit does not exercise this case. Before retrying, reread the database and protected storage through an independent session and record the operation outcome and IDs. A client/network error alone does not prove rollback.

| Operation | Required observation before and after a retry |
| --- | --- |
| Create image/item or comment | Record row IDs/counts, image key/checksum and comment body after the lost response. Repeat the same request once and reread rows/objects. These POSTs have no idempotency key: a retry may create a distinct item/object or comment. Record any additional IDs and verify original content is unchanged; never mark duplicate-free replay as supported or retry blindly. |
| Archive | Verify the intended item's archived state and retained image/comments after the lost response; replay and record the actual response and DB/storage state. The original item must remain archived with preserved history, without an extra item or content deletion. |
| Layout | Use a real geometry/stack change (a no-op does not increment the version). Record geometry/stack and `layoutVersion` after commit. Replay the same expected version: expect 409 and no second version increment or geometry/stack change. Reload before deciding whether another edit is needed. |

For every probe record **committed / not committed / unknown**, retry response and duplicate/state comparison. An unreadable DB/object result is **NOT TESTED / inconclusive**, never a PASS. Unexpected history loss or mutation is a failed acceptance observation to triage separately, not proof supplied by this document.

## Automation and manual boundary

- Follow the isolated PostgreSQL/MinIO service, migration and test setup in [CI](../../.github/workflows/ci.yml). Set `DATABASE_URL` and `TEST_DATABASE_URL` to the same disposable migrated database. Run `RUN_PROPOSAL_CONCURRENCY_TEST=1 npm test` for Canvas database suites, and also enable `RUN_CANVAS_STORAGE_TEST=1` with `S3_ENDPOINT`, bucket and test credentials for asset suites; `TEST_DATABASE_URL` alone does not enable Canvas integration tests. Run `npx tsc --noEmit`, `npm run build`, and `E2E_INTEGRATION=1 npm run test:e2e` against the same checked-out candidate SHA and isolated services. The inline environment syntax is for a POSIX shell; in PowerShell set each `$env:NAME` before running the command. CI already exercises Canvas membership, item/asset and spatial flows; compare **actual jobs, skips and checkout SHA**, not just a green badge.
- Inspect [Canvas membership](../../e2e/canvas-membership.integration.spec.ts), [item/storage](../../e2e/canvas-items.integration.spec.ts) and [spatial UI](../../e2e/canvas-spatial-ui.integration.spec.ts) alongside [PostgreSQL layout/comment regression](../../src/lib/canvas/feedback.integration.test.ts). These automated cases are not a substitute for a complete two-person manual session.
- **Deferred to one integrated RC usability study:** first-time designer comprehension, spatial interaction quality, readability of real design samples and navigation expectations. Physical touch hardware and screen-reader acceptance require separately recorded devices/software, because desktop viewport emulation does not establish either.

## Exit record (fill in after execution)

- SHA / environment / migration status: **Not yet recorded**
- Two-account integration result and protected image evidence: **NOT TESTED**
- Contributor deletion (isolated fixture `prisma.user.delete`; no product deletion flow): stable IDs, images/provenance/comments, anonymous UI and stale-session write rejection: **NOT TESTED**
- Lost-response commit/retry probes (create/comment/archive/layout, duplicate/state comparison): **NOT TESTED**
- DB/storage contention and latest CI links: **Not yet recorded**
- Outstanding P0/P1, regression issues and owners: **Not yet recorded**
- Decision: **#129 remains open until internal verification is complete; do not label this document as proof of RC readiness.**
