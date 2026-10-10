## Application captures for PR #117

These repository-local PNGs show the application components implementing design PRs [#110](https://github.com/makesomethingshit/open-design-registry/pull/110), [#111](https://github.com/makesomethingshit/open-design-registry/pull/111) and [#112](https://github.com/makesomethingshit/open-design-registry/pull/112) together. They use the fixtures described below and do not establish production deployment status.

- Landing: original Aster artwork, source and history, original copy, one hero Explore action and the B4 creation callout after the example.
- Header: ODR wordmark, 88px desktop row, original public navigation order and spacing, quiet theme selector, Account disclosure. At 440px the header follows the original three rows; narrower screens give New project its own row to preserve readable actions.
- Contribute: original short introduction, secondary Search, filters and page count below it, unboxed request rows and inline View request. Live project links, activity, license, tools, tags, linked-preview attribution and pagination remain available.
- Icons: the actual Star, Watch, Contribute and Fork controls from #116, alongside the actual document editor. No screenshot substitutes these controls with mock buttons. Project actions use native 24px Octicons; editor controls use native 16px Octicons. New directional links use the pinned official arrow-up-right glyph.

The project and editor captures use the development-only `/design-system` fixtures. This route returns 404 in production. Star/Watch API responses are browser fixtures; keyboard activation and document Preview/Write were exercised. Header captures use a test session with three unread notifications.

Contribute captures use the actual `/contribute` page with two local Aster request records temporarily replacing its database query. The preview response was the bundled original `landing-aster.svg`. The real query was restored immediately after capture; neither the temporary records nor a QA route is shipped. Search/filter submission and keyboard request entry were checked with fixtures. These captures verify presentation, not live PostgreSQL/S3 integration.

Capture review exposed a load-event race: a preview could load before hydration while its skeleton remained on top. Previews now use browser-native lazy loading without an overlay, and detect errors already completed before hydration. The committed browser regression checks verify visible artwork across repeat visits and a failed-image fallback.

Run the repeatable browser checks with:

```sh
npm run test:e2e -- e2e/landing-ui.spec.ts e2e/header-ui.spec.ts e2e/stage-c-project-explore.spec.ts --workers=1
```

View these files directly from this directory. Visual acceptance still requires human review. The implementation retains the existing Pretendard font and semantic theme tokens, so these captures are not a pixel-for-pixel copy of the static reference boards.
