# Moderation — pre-RC scope and restoration review (#136)

**Status: internal operator acceptance plan, not completed acceptance.** The Project hide / shared-asset suppression split was implemented in #145. This document does not change that policy, restart the decision, or imply that production/legacy records have been manually inspected.

## Fixed policy

1. Project hide applies to the reported Project; another owner's Fork remains independently public even when it shares the same cover.
2. Asset suppression affects delivery of the blocked asset key everywhere it is referenced, regardless of Project/Fork visibility. It does **not** set every referencing Project to private.
3. Hide and suppress are two separate administrative actions. Restore visibility and release an asset block separately.
4. Retain moderation actors, timestamps, reason and decision/restoration history. A deleted Report does not silently lift the decision.
5. A Project that was private before the action, or that its owner made private later, must not be automatically published by restoration.
6. Distinct active suppression decisions for the same key remain effective when just one is released.

## Isolated operator walkthrough

Use test accounts and synthetic images in an isolated PostgreSQL/MinIO instance; never exercise hide or asset-block operations against production users to complete this checklist. Preserve exact candidate SHA, migration status and operation timestamps.

| Setup/action | Expected Project visibility | Expected asset delivery |
| --- | --- | --- |
| Public A and independently owned public Fork B share cover K; public C uses cover L | A, B and C initially public | K and L readable under existing ACL |
| Admin hides reported A | A hidden; B/C still public | B's reference to K remains available unless K has a separate block |
| Admin suppresses K | B/C remain in their previous visibility states | K inaccessible through all supported asset URL forms, L unaffected |
| Admin restores A only | A public only if its original/owner-controlled public state permits; B/C unaffected | K stays suppressed |
| **Create a second independent Report** against B (which also references K) and suppress K under that Report, without hiding B | B/C remain public; database confirms two distinct active suppression decisions for K | K remains blocked; L unaffected |
| Admin releases **only the first Report's** block on K; inspect both decision records | Project visibility unchanged; second block still active | K stays blocked because the second decision is still active |
| Admin releases the **second Report's** remaining block on K | Project visibility unchanged; zero active K blocks | K becomes accessible only where normal Project/asset ACL permits |
| **Separate active Project-hold fixture:** hide a fresh public Project D, then delete the associated Report or reporter **while the hold is active** (independent fixture per deletion). Check D's continued invisibility, retained-decision entry and admin restore; only then restore the hold | D remains hidden until its hold is explicitly restored; retained records survive Report/reporter deletion | Asset access continues to follow D's current visibility and any independent block |
| **Separate active asset-block fixture:** suppress a fresh key on a new Report, then delete its Report, reporter or relevant Project **before releasing the block** (independent fixture per deletion) | Retained asset decision remains available to admin | The active block still prevents delivery until explicitly released |
| **Separate owner-privacy-during-hold fixture:** begin with public Project D, hide it via Report, then have its owner **explicitly choose private while the hold is active** (send `isPublic: false` through the settings API; if using the UI, toggle checked then unchecked so the form actually submits the false value). Check `ModerationProjectHold.wasPublic` becomes false **before** restoring. | After hold release, Project D stays private and anonymous Project GET remains 404 | Private assets remain ACL-protected |
| **Separate pre-existing-private/legacy fixture:** start with a Project that was private before moderation, or a legacy review candidate, and remove a hold only after inspecting original visibility evidence | Private remains private after hold release | No delivery without ordinary access rights |

Record the two distinct Report IDs and suppression decision IDs before the partial-release test. A retry of the **same** Report's suppression is not a second active decision. Treat project-hold deletion, asset-block deletion, owner privacy changed during an active hold, and pre-existing-private/legacy checks as **independent fixtures**; none can follow final-block release using the same dataset. Record project hold IDs and `wasPublic` before/after the explicit privacy transition.

## Interface and migration observations to record

- In the admin report interface, distinguish **Hide Project** from **Suppress shared asset**, and record whether users can understand cross-Fork reach *before* confirming. The displayed count covers exact stored `coverUrl` matches only; differently formatted URLs and other asset references are excluded. Record that count with its limitation, not as the total number of affected references.
- Confirm separate restore controls and the retained-decisions view after report deletion: the UI exposes the report ID, saved reason/details, blocked keys and restore controls. It does not show separate decision actor, timestamp or hidden Project ID **fields**; verify those in isolated `ModerationEvent` / `ModerationProjectHold` / `ModerationAssetBlock` records, retaining IDs across report deletion. **Legacy exception:** migrated candidate entries may use a synthetic retained Report ID in the form `legacy-hide:<projectId>` that the UI renders verbatim in the heading, thereby exposing the Project ID within the displayed Report ID. Redact the entire retained ID/heading (and related IDs, private keys and reporter identities) from screenshots before sharing.
- Verify unauthorized moderation `PATCH` is HTTP 403, and private asset `GET` is 404 for an anonymous or signed-in non-owner request through the key proxy, stored URL and legacy URL form. An authenticated owner may receive 200 for their private Project asset under normal ACL; verify that separately. A moderated asset block returns 404 even to its owner across those URL forms. Successful restore `PATCH` returns 200; after an owner chooses private, anonymous Project `GET` must still return 404 until the owner republishes.
- Probe duplicate decisions: a second report trying to hide an already-held Project returns 409 and remains `OPEN`; retrying the same report's existing block returns 200 without another block or audit event. Record before/after counts in the isolated database.
- Legacy rows created before the moderation-scope migration are **review candidates, not confirmed hides**. Compare retained candidates with backup/operational evidence, including changed/deleted covers and deleted reports, before any release or publication decision. Never bulk-publish candidates.
- Verify migrations are applied in isolation and run [moderation PostgreSQL/MinIO browser regression](../e2e/moderation.integration.spec.ts) with the same exact SHA. A passing fixture alone does not prove operator UX or live legacy-data correctness.

## Evidence template

- SHA, test DB / storage, migration status: **Not recorded**
- Synthetic A/B/K/L scenario and asset URL variants: **Not recorded**
- Admin UI before/after evidence (sanitized): **Not recorded**
- Restore/deleted-Report/legacy candidate audit results: **Not recorded**
- P0/P1 findings, owners, proposed follow-up issue URLs: **Not recorded**

Do not close #136 based solely on this runbook. Manual operator acceptance is an **internal readiness** action before `0.1.0-rc.1`; a consolidated external usability study belongs to the RC phase.
