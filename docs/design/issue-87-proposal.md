# Issue #87: global header and account navigation — P1 design proposal

**Decision status:** implementation is intentionally pending a maintainer choice.

**Issue:** [#87](https://github.com/makesomethingshit/open-design-registry/issues/87)

The proposed decision is between two navigation shapes:

- **A — public-first header with a compact Account disclosure (recommended).** Keep `Explore`, `Contribute`, `Feed`, and `New project` visible. Put `My projects`, `Starred`, `Notifications`, and `Sign out` behind one clearly labelled account control. Keep the control available to keyboard users and show the current location inside either group.
- **B — two visible navigation rows.** Keep the same public group visible, then show the account group as a second row with direct links and the `Sign out` button. On a 440px viewport both groups wrap into a small grid instead of scrolling.

The maintainer choice is **A or B**. The recommendation is A because it preserves the four public actions and search while giving personal actions a named home, and it removes the current narrow-screen overflow without making the global header substantially taller on every page. B remains a credible choice if direct visibility of every signed-in destination is more important than header height.

## Evidence from the current product

- `app/auth-nav.tsx:56-58` renders public links and signed-in personal links in one `.auth-nav` row. The signed-in link to `/notifications` is labelled `Activity`, while the route and page are already Notifications.
- `src/styles/legacy-bridge.css:25-40` gives the header one grid, a single flex navigation row, and `white-space: nowrap`.
- `src/styles/legacy-bridge.css:209-225` moves navigation below the header at narrower widths, then enables `overflow-x: auto` below `48rem`. This is the direct source of the issue's 440px clipping tradeoff.
- `app/layout.tsx:14` keeps the header contract small: brand, global search, theme select, and `AuthNav`. The proposal keeps that contract and does not introduce route or data changes.
- `app/global-search.tsx:24` already exposes a labelled search form targeting `/explore`; search remains a first-class header action in both alternatives.
- `docs/current-capabilities.md:42-46,50` defines `/feed` as public Revision/Release discovery and `/notifications` as the signed-in personal notification screen. `docs/terminology.md:28-29` makes the same distinction and records that the current `Activity` link points to Notifications.
- `CONTRIBUTING.md:19,36-38` requires a P1 decision before implementation and allows a draft or mockup to record that decision.

## Alternatives

### A — public-first header with Account disclosure (recommended)

Desktop keeps this order and emphasis:

`Explore` · `Contribute` · `Feed` · **`New project`** · search · `Account`

The signed-in account control is a real button or equivalent disclosure trigger, labelled `Account` with the existing avatar/name available as supporting content. Its panel contains:

1. `My projects` → `/projects`
2. `Starred` → `/stars`
3. `Notifications` → `/notifications`, with the unread count announced accessibly
4. `Sign out` (the existing action)

The existing role-gated `Reports` destination remains account-only when present; it should not determine the public header layout. `New project` stays in the public group because the issue explicitly treats it as a primary creation action rather than a private account destination.

At 440px, the brand and Account control share the first row, search occupies the next row, and the public group wraps into two columns. The Account panel can use the available width and wrap its links; the page never relies on horizontal scrolling.

The disclosure must be operable by mouse and keyboard: tab to the trigger, Enter/Space to open, tab to each link/action, Escape to close and restore focus. The active route uses `aria-current="page"` on its link. When the current route is inside the closed account group, the trigger also receives active styling and an accessible current-section state; opening the panel exposes the matching link with `aria-current="page"`. Opening the account panel must not be required to understand that `/feed` is the current public location.

**Tradeoff:** personal destinations take one interaction after the header gains a meaningful account label. The compact shape gives the 440px case enough room for all primary public actions and search.

### B — two visible navigation rows

Desktop keeps two named groups visible:

- **Explore:** `Explore` · `Contribute` · `Feed` · **`New project`**
- **Account:** `My projects` · `Starred` · `Notifications` · `Sign out`

The groups use separate `nav` landmarks or equivalent labels. The current route is styled and marked with `aria-current="page"`; the account destinations are direct links, so no disclosure behavior is needed. `Reports` remains an account-only item when rendered for admins.

At 440px, the public group and account group each wrap to two columns. The rows may increase the sticky header height, but every action remains visible, tabbable, and executable without horizontal scrolling.

**Tradeoff:** this maximizes immediate discoverability and has the smallest interaction change, but it consumes more vertical space and makes the global header visually heavier on every signed-in page.

## Exact scope after the decision

The implementation PR should be limited to the global header and its focused checks:

- update `app/auth-nav.tsx` to express the chosen public/account grouping, preserve existing route URLs, preserve the signed-out `Sign in` state, and rename the `/notifications` affordance to `Notifications`;
- update `src/styles/legacy-bridge.css` for the chosen desktop/mobile layout, focus states, active location, and a 440px no-overflow invariant;
- update `app/layout.tsx` only if the selected grouping needs a separate landmark or trigger container;
- update focused `app/auth-nav.test.tsx` coverage and add a browser check for logged-out/logged-in desktop and 440px keyboard behavior if the repository's existing test harness is used;
- leave notification data, unread/read behavior, sorting, APIs, route semantics, and page content unchanged.

## Acceptance mapping

| Issue #87 requirement | Decision and implementation evidence |
| --- | --- |
| Public and personal priorities are distinguishable | Separate labelled public and account groups; `Explore`, `Contribute`, `Feed`, and `New project` stay public and prominent. |
| Current location is visible | Apply `aria-current="page"` and the existing active visual treatment to the matching link; A also marks the closed Account trigger as the current section when the active route is inside its panel. |
| My projects, Starred, Notifications, and Sign out are easy to find | A exposes one labelled Account control with all four actions; B keeps all four directly visible. Both keep each action tabbable and executable. |
| Notifications has personal-notification meaning | Use the visible label `Notifications` and `/notifications`; keep the existing page title/description and unread behavior. Keep `Feed` reserved for public Revision/Release changes. |
| Logged-in ~440px header has no clipping or horizontal scrolling | Wrap or stack the groups at the 440px target, assert `scrollWidth <= clientWidth`, and exercise the last account action. |
| Desktop/mobile and keyboard validation | Verify logged-out and logged-in states at desktop and 440px, at least on `/explore`, `/feed`, `/projects`, `/stars`, and `/notifications`; include trigger open/close and link activation for A. |

## Human decision to record on the issue

**Choose A (recommended compact Account disclosure) or B (all account actions visible in a second row). Keep `New project` in the public group and keep `Reports` account-only in either direction.**

The static comparison is in [`issue-87-preview.html`](./issue-87-preview.html). It is a review aid only; it does not implement either direction.
