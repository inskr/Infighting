# Task 4 Report — Reflow, Touch Targets, and Reduced Motion

## Scope

- Base: `946f434a2221036e7b0c65829ada4dd6da4c5610`
- Worktree: `F:\项目\个人网站-WorkBuddy\.worktrees\static-site-upgrade`
- Preserved public interfaces, Task 2 focus/skip styles, and Task 3 announcements.
- Did not fetch feeds, mutate external state, or change page data.

## RED

Tests were written before production CSS changes.

- `node --test tests/home-effects.test.cjs tests/ui-effects.test.cjs`: 14/14 passed. These tests added the missing guards for zero Canvas contexts, pointer bindings, and animation frames under both coarse-pointer and reduced-motion preferences, plus reveal visibility without observers. The existing implementation already honored those contracts.
- `npx playwright test tests/browser/reflow-motion.spec.cjs --workers=1`: 4 passed, 17 failed.
- Concrete RED findings:
  - `body { overflow-x: hidden; }` globally masked horizontal layout mistakes.
  - `.site-nav` was an internal horizontal scroller at 320px and 200%-zoom-equivalent layout.
  - Primary navigation links were 38.39px high.
  - Interactive article/card tags were 24px high; tag-cloud links were 38px high.
  - Like buttons were approximately 26.94×18.69px.
  - Pagination links were 38×38px.
  - Code and runtime-generated `.table-wrapper` surfaces needed explicit, named internal scroll containment.

## GREEN implementation

- Removed the global `body` horizontal clipping rule.
- Added targeted `min-width: 0` rules to the relevant flex/grid containers and children.
- Made `pre` and `.table-wrapper` the named article overflow surfaces; their content can scroll internally without widening the document.
- Enforced 44×44 CSS-pixel minimums for primary navigation, pagination, search controls/retry, clickable tags, tag-cloud links, and like buttons.
- Reflowed the narrow navigation without horizontal scrolling; the redundant brand block is hidden at `max-width: 680px` while the explicit Home navigation destination remains available.
- Left `home-effects.js`, `ui-effects.js`, and `home-page.js` unchanged because the base already implemented the required early simple-effects return, reveal fallback, reduced-motion Hero/Canvas shutdown, and pagination `behavior: "auto"`. The strengthened Node and Chromium tests now lock those behaviors.

Focused GREEN evidence:

- `node --test tests/home-effects.test.cjs tests/ui-effects.test.cjs tests/home-page.test.cjs`: 22/22 passed.
- `npx playwright test tests/browser/reflow-motion.spec.cjs --workers=1`: 21/21 passed.

## Reflow and target matrix

The 200% case uses a 640px viewport with CSS `zoom: 2`, yielding a 320px-equivalent reflow width. Target measurements are normalized back to CSS pixels before asserting 44×44.

| Route | 320px document reflow | 320px targets | 200% equivalent reflow | 200% equivalent targets |
| --- | --- | --- | --- | --- |
| Home `/` | PASS | PASS | PASS | PASS |
| Search `/search.html` | PASS | PASS | PASS | PASS |
| Tags `/tags.html` | PASS | PASS | PASS | PASS |
| Archive `/archive.html` | PASS | PASS | PASS | PASS |
| Long article `/posts/embedded-robotics-learning-roadmap.html` | PASS | PASS | PASS | PASS |

For each reflow check, the test first records the computed body overflow policy, then temporarily forces it visible so document overflow cannot be hidden. It asserts `scrollWidth <= clientWidth` and rejects internal horizontal scroll containers other than `.article-body pre` and `.article-body .table-wrapper`.

## Reduced-motion and simple-effects matrix

| Behavior | Evidence | Result |
| --- | --- | --- |
| Coarse pointer does not obtain Canvas context | Node counters | PASS (0) |
| Coarse pointer does not bind pointer listeners | Node counters | PASS (0) |
| Coarse pointer does not request animation frames | Node counters | PASS (0) |
| Reduced motion does not obtain Canvas context | Node + Chromium counters | PASS (0) |
| Reduced motion does not bind pointer listeners | Node + Chromium counters | PASS (0) |
| Reduced motion does not request animation frames | Node + Chromium counters | PASS (0) |
| Reveal content is immediately visible without observers | Node + Chromium computed styles | PASS |
| Hero image/panel and Canvas animation are disabled | Chromium reduced-motion media emulation | PASS |
| Pagination scroll uses `behavior: "auto"` | Existing Node contract + Chromium interception | PASS |

## Full verification

- `npm run build`: PASS; posts index generated with 9 posts and 7 responsive Hero images generated; no generated-file diff remained.
- `npm test`: PASS; main Node runner 203/203, plus standalone stats-format 6/6, likes-storage 64/64, and stats-fallback 7/7.
- `npm run test:browser`: PASS; 31/31 Chromium tests.
- `git diff --check`: PASS (only Git line-ending notices; no whitespace errors).

## Self-review

- No global `overflow-x: hidden` or equivalent document-level clipping was introduced.
- Only named code/table surfaces are allowed to scroll internally in the browser regression test.
- The 44px rule targets actual interactive tags (`a.tag`), not inert Hero label spans or language labels.
- Disabled liked buttons retain 44px styling even though the browser target audit only requires currently clickable controls.
- Existing focus, skip-link, live-region, optimistic-like, and search-status behavior remained covered by the complete Node and browser suites.
- Changes are limited to the visual CSS, focused tests, the new browser spec, and this report.

## Concerns

- Playwright does not expose a stable cross-platform browser-toolbar zoom API; the 200% scenario is modeled with CSS `zoom: 2` and normalized CSS-pixel target measurements.
- Chromium prints the existing `NO_COLOR`/`FORCE_COLOR` warning during Playwright runs; it does not affect results.
