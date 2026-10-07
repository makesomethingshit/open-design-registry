# Icon set options for ODR

Design proposal for the text-heavy project actions and document editor. Related to [#79](https://github.com/makesomethingshit/open-design-registry/issues/79), action hierarchy; this proposal does not complete that issue.

Open [the self-contained comparison](icon-set-options.html) in a browser. Select All three or an individual family, then compare at desktop and 390px mobile widths. The controls demonstrate appearance only; they do not save, upload, or navigate. No package installation, remote fonts, scripts, or network requests are required by the preview.

## Three alternatives

All three retain ODR's Paper / Ink / Iris palette, typography sizes, control radii, 8px icon-label gap and actual project vocabulary. The sample project is fictional. The SVGs and HTML are composed mockups based on current code, not screenshots of the live product or Penpot exports.

| Option | Official set | Rendering | Review focus |
| --- | --- | --- | --- |
| A | [Lucide](https://lucide.dev) | Native outline, 24px grid, 2px stroke | Restrained shapes; recommended starting point |
| B | [Tabler](https://tabler.io/icons) | Native outline, 24px grid, 2px stroke | Distinct geometry and detail at 16px |
| C | [Phosphor](https://phosphoricons.com) | Native regular paths, 256px grid | Fuller silhouette and weight consistency |

### A — Lucide

![Lucide applied to the ODR project header and document editor](icon-sets/a-lucide.svg)

### B — Tabler

![Tabler applied to the same ODR project header and document editor](icon-sets/b-tabler.svg)

### C — Phosphor Regular

![Phosphor applied to the same ODR project header and document editor](icon-sets/c-phosphor.svg)

## Proposed application rules

- Keep icon + text for Star, Watch, Fork, Contribute, Edit document, Add image, Insert table and Download. Contribute uses the existing Proposal concept; confirm its symbol is understandable to designers before implementation.
- Allow icon-only controls for close, zoom and more actions. Provide an accessible name and a tooltip shown on hover and keyboard focus; the preview has names and native title hints, not a production tooltip implementation.
- Keep Save document, Cancel document changes, Submit Proposal and Apply changes as explicit text. Icons must not replace the explanation of consequences.
- Use 16px icons in compact tools and 20px in standard controls. Keep 32px / 40px desktop controls, 44px minimum mobile targets. Preserve source geometry rather than redrawing icons or forcing Phosphor paths into a stroke model.
- Use one selected family consistently, including existing status icons where equivalents exist. Do not mix families in the production interface. Existing loading feedback remains the spinner, not another icon family.
- Keep current hover, focus, disabled and loading behavior and accessible state announcements. A selected Star/Watch state must remain identifiable by text plus `aria-pressed`; fill can be a supplemental cue after a family is chosen.

## Recommendation and decision

**Provisional recommendation: A / Lucide.** Its outline treatment is visually close to the existing `Icon` component's restrained geometry. This is design judgment, not a performance or usability measurement. B and C remain equal-scope alternatives. No selection has been made and no production icon dependency has been added.

Human decision needed: choose A / B / C, approve icon + text versus icon-only placement, and confirm the Contribute symbol. Then implement the selected family through the existing `Icon`, `Button` and `IconButton` boundaries. Use named imports or a small licensed SVG subset; choose packaging during implementation rather than installing all three sets now.

## Implementation anchors

- `src/components/ui/icon.tsx` and `button.tsx`: existing icon wrapper and accessible icon-button boundary.
- `src/components/ui/button.module.css` and `src/styles/tokens.css`: existing variants, states, control dimensions and light/dark tokens.
- `app/projects/[slug]/project-shell.tsx`, `project-star-button.tsx`, `project-watch-button.tsx`, `contribute-dialog.tsx`: actual project actions.
- `app/projects/[slug]/project-document.tsx` and `src/components/ui/project-document-editor.tsx`: text-heavy document controls.

## Source mapping and licenses

The preview embeds official SVGs from these pinned commits. Lucide includes ISC and Feather-derived MIT notices; Tabler and Phosphor include their MIT notices. Full upstream notices are retained in [icon-set-licenses.txt](icon-set-licenses.txt), and each standalone SVG carries its family notice in metadata. The SVG source paths are preserved; only container size and inherited color change.

- **Lucide**: [1fae58d0a9c6](https://github.com/lucide-icons/lucide/tree/1fae58d0a9c661a338036838caf3399b5507bab6/icons/)
- **Tabler**: [a4ce1404bc6d](https://github.com/tabler/tabler-icons/tree/a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d/icons/outline/)
- **Phosphor**: [2b75f3ad12b4](https://github.com/phosphor-icons/core/tree/2b75f3ad12b420c9504ef05df8d2564a28f8500e/assets/regular/)

| Action | Lucide | Tabler | Phosphor Regular |
| --- | --- | --- | --- |
| Search | search | search | magnifying-glass |
| Star | star | star | star |
| Watch | bell | bell | bell |
| Fork | git-fork | git-fork | git-fork |
| Contribute | git-pull-request | git-pull-request | git-pull-request |
| Edit | pencil | pencil | pencil-simple |
| Preview | eye | eye | eye |
| Image | image | photo | image |
| Table | table | table | table |
| Download | download | download | download-simple |
| Settings | settings | settings | gear-six |
| Close | x | x | x |
| More | ellipsis | dots | dots-three |
| Check | check | check | check |
| Plus | plus | plus | plus |
| Minus | minus | minus | minus |
| Zoom | zoom-in | zoom-in | magnifying-glass-plus |
| Warning | triangle-alert | alert-triangle | warning |

## Review checklist

- [ ] Choose one family at 16px and 20px, at native scale.
- [ ] Confirm all three show the same labels and placement, including dark samples.
- [ ] Review keyboard focus and accessible names for icon-only controls.
- [ ] Confirm compact/mobile wrapping and 44px touch targets at 390px.
- [ ] Confirm no action meaning is lost by adding or removing a label.

## Validation evidence

The browser preview was inspected at 1440px desktop and 390px mobile widths. At 390px there was no page overflow, no unnamed buttons and no button target below 44px. Each individual family view was opened and captured, including its dark samples and state strip. The three-family desktop comparison was inspected at 1440px. Static SVGs were parsed as XML and their source icons retain the upstream geometry.

Penpot connection remains unavailable for design execution: the registered tool reports no connected instance. A fresh official remote connection with the renewed configuration initializes, but the read-only design task times out after 120 seconds even with the tab active and MCP marked connected. No design write was attempted. These alternatives are browser/SVG mockups, not verified live Penpot boards.
