# Contributor Canvas C — spatial board and item feedback (#132)

**Status: DRAFT scaffold only.** Based on PR #167 / #166. Stores per-item x/y/width/height/zIndex plus an optimistic `ProjectCanvas.layoutVersion` and comment identity. **No spatial UI, pan/zoom or comment route is implemented here yet.**

## Contract
- Miro-like freely positioned 2D work surface, with predictable selection, pan/zoom, fit/reset and keyboard/mobile alternatives. No vector editor, connector engine, multiplayer cursors or general-purpose object merging.
- Coordinates are stored explicitly; `sortOrder` from B is only the accessible reading fallback, not spatial layout.
- Move/resize/reorder requires APPROVED Canvas owner, fresh Project visibility/Canvas ACL, item membership and compare-and-increment layoutVersion under a transaction; report stale edits with 409.
- Each comment belongs permanently to CanvasItem.id; moving/reordering an item cannot move its feedback to another item.
- Signed-in readers may comment on active APPROVED public Canvas items; archived items and REVOKED/reapplication history remain readable but reject new comments.
- Side-panel discussion on desktop, full-width below selection on narrow screens, focus and keyboard controls throughout.

## Remaining to make #132 ready
- [ ] Versioned atomic layout write/query APIs with two-writer conflict tests on PostgreSQL
- [ ] Comment read/create API with private/revoked/archive/item-ownership enforcement
- [ ] Canvas pan/zoom/fit/reset, keyboard move/resize, 320/390px UX and feedback panel
- [ ] Real browser tests for saved positions, comment linkage after moves, archival and ACL
- [ ] Validate complete stacked migration sequence, typecheck/build and all regressions
