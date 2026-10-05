# Issue #87: global header and account navigation — refined A direction

**Decision status:** A is the chosen structural direction. The refined visual result is awaiting P2 review.

**Issue:** [#87](https://github.com/makesomethingshit/open-design-registry/issues/87)

**Decision feedback:** [human comment 5988603961](https://github.com/makesomethingshit/open-design-registry/pull/112#issuecomment-5988603961)

The human decision selected the A structure and identified the first result as too cluttered. This document records the quieter native A revision. There is no remaining A/B choice: the review question is whether this refined result is clear, calm, and complete at desktop and 440px mobile.

## Chosen structure

### Desktop: one compact closed state

The default signed-in header is one compact row, in this order:

`brand` · `Explore` · `Contribute` · `Feed` · wide global search · **`New project`** · quiet theme select · `Account`

The public group is visible and low-noise. `New project` is the only primary action. Theme access remains available without competing with navigation. The Account trigger is a single quiet control; its contents are not displayed in the default screen.

The separate expanded-state specimen shows the Account panel with:

1. `My projects` → `/projects`
2. `Starred` → `/stars`
3. `Notifications` → `/notifications`, with the unread count announced accessibly
4. `Sign out` (the existing action)
5. `Reports` only when the existing admin role gate allows it

The panel is an account grouping, not a second public navigation row. The closed state should remain the primary review frame.

### Mobile: three predictable rows

At the 440px target:

1. first row: brand, quiet theme select, Account trigger;
2. second row: full-width global search;
3. third row: quiet `Explore`, `Contribute`, and `Feed` links plus the `New project` primary action.

The public links may wrap within the third row, but the header must not use a horizontal scrollbar. An open Account panel is an overlay constrained to the viewport; it must not push the page wider or place its last action off-screen.

## Visual refinement contract

- Remove explanatory canvas copy that reads like page content. The page specimen should show the actual Feed heading and one representative update card, with ordinary product content doing the explaining.
- Mark the active `Feed` location with one subtle underline. Do not use an accent-filled navigation pill for the active public link.
- Keep the default desktop header uncluttered. Show Account contents only in the separate expanded-state specimen and in the interaction contract below it.
- Keep public and account actions visually distinct without adding a second desktop navigation row.
- Use the existing ODR semantic tokens, typography, spacing, focus treatment, and bundled local assets. Do not add a token library or new dependency.

## Evidence from the current product

- `app/auth-nav.tsx:56-58` currently renders public links and signed-in personal links in one `.auth-nav` row. The signed-in link to `/notifications` is labelled `Activity`, while the route and page are already Notifications.
- `src/styles/legacy-bridge.css:25-40` gives the header one grid, a single flex navigation row, and `white-space: nowrap`.
- `src/styles/legacy-bridge.css:209-225` moves navigation below the header at narrower widths, then enables `overflow-x: auto` below `48rem`. The refined mobile contract removes that overflow behavior from the chosen implementation.
- `app/layout.tsx:14` keeps the header contract small: brand, global search, theme select, and `AuthNav`.
- `app/global-search.tsx:24` already exposes a labelled search form targeting `/explore`; the revision keeps it as the wide second-row mobile search and the wide desktop search field.
- `docs/current-capabilities.md:42-46,50` defines `/feed` as public Revision/Release discovery and `/notifications` as the signed-in personal notification screen. `docs/terminology.md:28-29` makes the same distinction and records that the current `Activity` link points to Notifications.
- `CONTRIBUTING.md:19,36-38` defines P1 as the decision stage and P2 as human review of the agreed visual result. The structure decision is complete; this refinement is P2.

## Semantic and interaction contract

- Keep the existing route URLs and signed-out state. Public links remain `/explore`, `/contribute`, `/feed`, and `/projects/new`; account actions remain `/projects`, `/stars`, `/notifications`, and the existing sign-out action.
- Rename the visible `/notifications` affordance to `Notifications`. Its existing personal meaning, unread behavior, page title, description, data, sorting, and read state remain unchanged. `Feed` continues to mean the public Revision/Release stream.
- Use separate labelled public and account navigation landmarks or equivalent semantic groups.
- The Account control is a real keyboard-operable button or equivalent disclosure trigger with `aria-expanded` and `aria-controls`. Enter/Space opens it, Escape closes it and returns focus to the trigger, and every panel link/action is reachable and executable by keyboard.
- Mark the current public route with `aria-current="page"` and the subtle underline. When an account route is current while the panel is closed, the Account trigger receives an active current-section state; when the panel is open, the matching account link receives `aria-current="page"`.
- Keep `Reports` role-gated and inside the account group. It must not determine the public header emphasis or appear for ordinary users.
- Preserve the existing skip link, focus visibility, search semantics, and notification count announcement.

## Exact scope after the decision

This revision edits documentation only. The later implementation PR may touch the existing header contract and focused checks:

- `app/auth-nav.tsx` for the chosen grouping, Account disclosure, Notifications copy, current-route state, and preserved sign-out behavior;
- `src/styles/legacy-bridge.css` for the compact desktop row, three-row mobile layout, underline state, focus treatment, viewport-constrained overlay, and 440px no-overflow invariant;
- `app/layout.tsx` only if the selected grouping needs a separate landmark or trigger container;
- focused `app/auth-nav.test.tsx` coverage plus a browser check for logged-out/logged-in desktop and 440px keyboard behavior if the existing harness supports it.

The implementation must leave notification data, unread/read behavior, sorting, APIs, route semantics, and page content outside the header unchanged. No runtime files are changed by this proposal update.

## Acceptance mapping for the P2 visual review

| Issue #87 requirement | Refined A evidence to review |
| --- | --- |
| Public and personal priorities are distinguishable | One compact desktop row keeps Explore, Contribute, Feed, and New project visible; all personal actions live in the Account panel. |
| Current location is visible | Feed uses one subtle underline and `aria-current="page"`; an active account route marks the closed Account trigger and the open matching panel link. |
| My projects, Starred, Notifications, Sign out are easy to find | The Account trigger is visible in the default header; its expanded specimen shows all four named actions in one account group. Reports appears only for admins. |
| Notifications has personal-notification meaning | The affordance says `Notifications` and points to `/notifications`; Feed remains the public Revision/Release stream. Existing page copy and notification behavior stay intact. |
| Logged-in ~440px header has no clipping or horizontal scrolling | Brand/theme/Account, full search, and the wrapped three-link/New project row fit at 440px; an open Account overlay stays within the viewport and exposes Sign out. |
| Desktop/mobile and keyboard access | Review logged-out and logged-in states, Feed and account current states, Account open/close, Escape focus return, all panel actions, and the final narrow action at desktop and 440px. |
| Result is visually calm enough for P2 | Closed desktop header is the primary frame; explanatory canvas copy is removed; the Feed specimen shows a real heading and update card; active Feed uses an underline rather than an accent-filled pill. |

## Review status and artifacts

The structure is **chosen A**. Alternative B is archived and no longer asks for a decision. The open decision is limited to the **P2 visual result**: whether the refined header is quiet enough while keeping the public actions and Account entry discoverable.

The revised native A boards below are the current review artifacts. Earlier A/B boards remain untouched as comparison history.

The existing [HTML preview](./issue-87-preview.html) is marked **superseded**. It remains only as a historical static comparison and is not the refined A implementation.

## Current native A refinement

| State | Desktop | Mobile |
| --- | --- | --- |
| Default, Account closed | [1440px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be166a8451ce) | [440px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be16746b3504) |
| Account expanded | [1440px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be1673acb339) | [440px](https://design.penpot.app/#/workspace?team-id=c828d3cf-7d4e-8145-8008-97c0502ab146&file-id=c828d3cf-7d4e-8145-8008-97c16046a495&page-id=e4efa596-26fc-8098-8008-ba98657f1ef7&board-id=d8fcd456-2e62-80c8-8008-be167da73c0f) |

The default and expanded states are separate editable specimens. Existing Aster vectors and button component instances remain linked; the previous boards were preserved. PNGs are attached to the PR. These static boards do not establish live disclosure/keyboard/route behavior.
