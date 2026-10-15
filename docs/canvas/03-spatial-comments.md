# Contributor Canvas C — spatial board and item feedback (#132)

**Status: DRAFT, versioned layout and comment backend implemented; spatial UI acceptance remains pending.** Based on PR #167 / #166. No spatial UI or pan/zoom is claimed.

## Contract
- Miro-like freely positioned 2D work surface, with predictable selection, pan/zoom, fit/reset and keyboard/mobile alternatives. No vector editor, connector engine, multiplayer cursors or general-purpose object merging.
- Coordinates are stored explicitly; `sortOrder` from B is only the accessible reading fallback, not spatial layout.
- Move/resize/reorder requires APPROVED Canvas owner, fresh Project visibility/Canvas ACL, item membership and compare-and-increment layoutVersion under a transaction; report stale edits with 409.
- Each comment belongs permanently to CanvasItem.id; moving/reordering an item cannot move its feedback to another item.
- Signed-in readers may comment on active APPROVED public Canvas items; archived items and REVOKED/reapplication history remain readable but reject new comments.
- Side-panel discussion on desktop, full-width below selection on narrow screens, focus and keyboard controls throughout.

## Remaining to make #132 ready
- [x] Versioned atomic layout write/query APIs with two-writer conflict tests on PostgreSQL
- [x] Comment read/create API with private/revoked/archive/item-membership enforcement
- [ ] Canvas pan/zoom/fit/reset, keyboard move/resize, 320/390px UX and feedback panel
- [ ] Real browser tests for saved positions, comment linkage after moves, archival and ACL
- [ ] Validate complete stacked migration sequence, typecheck/build and all regressions

## API and failure evidence
- `PATCH .../canvases/:canvasId/layout` accepts the existing strict `{itemId, expectedCanvasVersion, rect}` schema. The owner/visibility/approval and active item membership checks run under Project→Canvas locks. A conditional `UPDATE ... WHERE layoutVersion = expected` increments the version atomically with the item update; stale requests return HTTP 409. Failed item persistence rolls the increment back.
- `GET .../canvases/:canvasId` exposes the persisted `layoutVersion`; `GET .../items` exposes saved coordinates. On 409 clients must reload these before submitting another edit.
- `GET .../comments?itemId=...` reads feedback, including readable archived/history items. `POST .../comments` accepts `{itemId, body}` and rejects anonymous (401), revoked/reapplying (403), archived (409), cross-Canvas or private (404) writes. The same Canvas lock serializes comments with archival and membership changes.
- Canvas, Item and Comment author references become NULL when contributor accounts are deleted; content, identity and feedback linkage remain. Project-owner account deletion is guarded by the ownership-transfer policy in A.
- `canvasExtent` accumulates bounds in one iteration without argument spread; the large case contains 250,000 rectangles.
- Browser API/authentication evidence does not prove the missing interactive board, accessibility or responsive UI. Draft status and issue UI checklists remain outstanding even when backend tests pass.
