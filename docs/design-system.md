# ODR Design System v2 — Foundation

This Phase A foundation uses the Paper / Ink / Iris vocabulary: neutral surfaces, high-legibility ink text, and Iris only for focus, active navigation, links, and actual application state.

## Tokens and theme

`src/styles/tokens.css` owns source values, semantic tokens, component aliases, typography, spacing, shape, controls, focus, shadow, motion, z-index, and layout tokens. New UI must use `--odr-*` semantic tokens instead of raw colors.

Theme is a three-value preference: `light`, `dark`, or `system`. `odr-theme` is the only cookie name and unrecognized values become `light`. The root layout reads that cookie on the server and sets `data-theme` before render. The client selector updates the document attribute and only writes one of those three values. `system` is light by default and changes only inside the `prefers-color-scheme: dark` rule.

`src/styles/legacy-bridge.css` is intentional temporary compatibility CSS for unchanged routes. It maps their historical variables to semantic tokens while later phases replace real component boundaries. Do not rename `repo-*` classes merely to remove the bridge.

## Typography and license

Pretendard Variable v1.3.9 is self-hosted at `public/fonts/PretendardVariable.woff2`; its upstream SIL Open Font License 1.1 text is preserved at `public/fonts/LICENSE.txt`. The source is the pinned [Pretendard v1.3.9 tag](https://github.com/orioncactus/pretendard/tree/v1.3.9). `font-display: swap` keeps the system fallback usable during loading.

Use `--odr-font-mono` only for technical identifiers such as revision numbers, IDs, file sizes, and checksums. Names and prose stay in `--odr-font-sans`.

## Primitives

The shared primitives live under `src/components/ui/`:

- `Button`, `IconButton`, and `TextLink`
- `Field`, `Input`, `Textarea`, `Select`, and native `Checkbox`
- `Badge`, `StatusBadge`, `Tag`, and `TagLink`
- `SectionNav`, `RouteNav`, `Tabs`, and `SegmentedControl`
- Native `Dialog` and `Drawer`; `Banner` and `EmptyState`
- `Stack`, `Inline`, `SectionHeader`, `PageHeader`, `Panel`, and `Divider`

`Tabs` are only for loaded panels and include arrow/Home/End navigation. Section and route navigation intentionally remain links. Dialogs use native modal behavior, focus an explicit safe action when supplied, close on Esc, and return focus to the opener.

`src/lib/ui/status-presentation.ts` maps server-provided status values to labels, tones, and icons only. It does not calculate proposal state or alter API enums. New user-facing text belongs in `src/lib/ui/copy.ts`.

## Catalog

`/design-system` is a development-only fixture catalog. It exercises states, error wiring, themes, dialog scrolling, status mappings, and preview ratios without fetching production data. The server calls `notFound()` in production; the `(internal)` route group alone is not treated as access control.

Browser captures are retained with this documentation:

- [Light, 1440 × 900](design-system-screenshots/catalog-light-1440x900.png)
- [Dark, 1440 × 900](design-system-screenshots/catalog-dark-1440x900.png)
- [System/light, 390 × 844](design-system-screenshots/catalog-system-390x844.png)
- [Proposal workspace, light 1440 × 900](design-system-screenshots/review-light-1440x900.png)
- [Proposal workspace, light 390 × 844](design-system-screenshots/review-light-390x844.png)

## Next phase

Phase B realizes the [documented integration seams](design-system-stage-b.md): `DesignPreview`, `ChangeItem`, `ReviewInspector`, and `ReviewActionBar` now compose the Proposal Review workspace. The controller keeps its existing API payloads, server-side visibility checks, and database schema unchanged.
