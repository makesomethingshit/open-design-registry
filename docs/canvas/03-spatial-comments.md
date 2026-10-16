# Contributor Canvas C — spatial board and item feedback (#132)

The spatial workspace is integrated in the Canvas detail route, based on PR #167 / #166. Full browser coverage exercises membership, items, pointer and keyboard layout editing, feedback, retention and responsive themes. The PR body records results and exact-SHA CI links.

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
- [x] Canvas pan/zoom/fit/reset, keyboard move/resize, 320/390px UX and feedback panel
- [x] Real browser test exercises actual pointer move/resize, persisted geometry after reload, one-request layer ordering, feedback on stable item IDs across two designers, archive/revocation read-only history, keyboard alternatives, and 320/390px layouts on the Canvas detail URL
- [ ] Validate complete stacked migration sequence, typecheck/build and all regressions
- [ ] Run hardware/screen-reader acceptance with NVDA, JAWS, VoiceOver or TalkBack; Playwright keyboard and viewport checks do not establish assistive-technology or physical-touch behavior

## API and failure evidence
- `PATCH .../canvases/:canvasId/layout` accepts the existing strict `{itemId, expectedCanvasVersion, rect}` schema. The owner/visibility/approval and active item membership checks run under Project→Canvas locks. A conditional `UPDATE ... WHERE layoutVersion = expected` increments the version atomically with the item update; stale requests return HTTP 409. Failed item persistence rolls the increment back.
- `GET .../canvases/:canvasId` exposes the persisted `layoutVersion`; `GET .../items` exposes saved coordinates. On 409 clients must reload these before submitting another edit.
- `GET .../comments?itemId=...` reads feedback, including readable archived/history items. `POST .../comments` accepts `{itemId, body}` and rejects anonymous (401), revoked/reapplying (403), archived (409), cross-Canvas or private (404) writes. The same Canvas lock serializes comments with archival and membership changes.
- Canvas, Item and Comment author references become NULL when contributor accounts are deleted; content, identity and feedback linkage remain. Project-owner account deletion is guarded by the ownership-transfer policy in A.
- `canvasExtent` accumulates bounds in one iteration without argument spread; the large case contains 250,000 rectangles.
- The focused Playwright run passed in Chromium against the integrated detail route: 1 test passed in 17.4 seconds. It checks 320px and 390px viewport widths and keyboard alternatives in a desktop browser; it does not emulate touch input or certify screen-reader announcements, focus behavior with assistive technology, or physical-device rendering. Run the stacked browser suite and obtain hardware/screen-reader evidence before treating the Draft as fully accepted.

## Review follow-up
- Archive from the board refreshes the item composer; Fit includes the same active/archived items currently rendered.
- Pointer resize selects its target. Keyboard movement clamps at coordinate bounds. Numeric controls retain raw text until blur/save, including an unfinished minus sign.
- New items occupy distinct four-column slots, skipping occupied rectangles. The additive migration backfills only entirely untouched default boards with layoutVersion 0; saved/customized boards retain their coordinates. Initial placement is limited to 15,388 slots within the coordinate bounds.
- PostgreSQL regression executes the actual migration SQL and checks both backfilled and preserved layouts. Public comment lists expose display attribution without internal author IDs.- Layer ordering includes archived cards so front/back actions match the rendered stack. The target must still be active.
- Reload reads the layout version before item geometry, so a concurrent writer cannot pair stale geometry with a newer accepted version; intervening writes cause a conservative 409.
- Ambiguous comment POSTs (transport failure, 5xx, unreadable response) disable retries with a persistent reload action, including after changing selection.
