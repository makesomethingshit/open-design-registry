# Contributor Canvas B — item and asset contract (#131)

**Status: DRAFT scaffold only.** Built on PR #166; adds `CanvasItem` data fields and input metadata schemas, **not** upload/read/write routes or UI. The immutable Revision/Proposal system is unchanged.

## Invariants
- Stable item IDs and explicit `IMAGE` / `TEXT` kinds. A future replacement archives the old item and creates a new ID, preserving comments/provenance.
- Original design vs. external reference provenance is explicit; Canvas images do **not** inherit Project/Revision licenses.
- Server issues storage keys; never trust a client-provided `assetKey`. Image bytes must pass real PNG/JPEG signature, size and auth checks.
- Future upload and item writes must serialize with #130 approval/revocation and check fresh Project/public visibility.
- The asset proxy must enforce CanvasItem reference + current visibility; guessing a key is not authorization.
- `sortOrder` is a reading/list fallback only. #132 spatial location uses persisted coordinates, not this order.

## Remaining to make #131 ready
- [ ] Authenticated multipart upload and TEXT item creation/update/archive APIs; file signature checks
- [ ] Transactional approval + project visibility checks, idempotency and orphan-object cleanup
- [ ] Add CanvasItem asset-proxy read ACL, including revoked-public history and private projects
- [ ] Owner-only compose UI; attribution, readable provenance, mobile/keyboard/image-error states
- [ ] Isolated PostgreSQL + MinIO + browser tests; verify migration/test/build
