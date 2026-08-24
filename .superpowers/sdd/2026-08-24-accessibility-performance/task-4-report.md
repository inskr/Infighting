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
  - `.site-nav` was an internal horizontal scroller at the 320 CSS px automated boundary.
  - Primary navigation links were 38.39px high.
  - Interactive article/card tags were 24px high; tag-cloud links were 38px high.
  - Like buttons were approximately 26.94×18.69px.
  - Pagination links were 38×38px.
  - Code and runtime-generated `.table-wrapper` surfaces needed explicit, named internal scroll containment.

## GREEN implementation

- Removed the global `body` horizontal clipping rule.
- Added targeted `min-width: 0` rules to the relevant flex/grid containers and children.
- Made `pre` and `.table-wrapper` the named article overflow surfaces; their content can scroll internally without widening the document.
- Enforced 44×44 CSS-pixel minimums for site identity, primary navigation, article navigation, pagination, search controls/retry, clickable tags, tag-cloud links, and like buttons.
- Reflowed the narrow header into a compact identity row plus navigation row. The linked logo and accessible `Infighting 首页` name remain visible without horizontal scrolling.
- Left `home-effects.js`, `ui-effects.js`, and `home-page.js` unchanged because the base already implemented the required early simple-effects return, reveal fallback, reduced-motion Hero/Canvas shutdown, and pagination `behavior: "auto"`. The strengthened Node and Chromium tests now lock those behaviors.

Focused GREEN evidence:

- `node --test tests/home-effects.test.cjs tests/ui-effects.test.cjs tests/home-page.test.cjs`: 22/22 passed.
- `npx playwright test tests/browser/reflow-motion.spec.cjs --workers=1`: 11/11 passed.

## Reflow and target matrix

Automation uses a real 320 CSS px viewport. Chromium explicitly reports both `window.innerWidth === 320` and `document.documentElement.clientWidth === 320`, while `matchMedia("(max-width: 680px)").matches` is true. This is the automated reflow boundary corresponding to a 640 CSS px viewport viewed at 200% toolbar zoom; it is not an automated toolbar-zoom test.

| Route | 320 CSS px document reflow | 320 CSS px targets | Compact identity visible |
| --- | --- | --- | --- |
| Home `/` | PASS | PASS | PASS |
| Search `/search.html` | PASS | PASS | PASS |
| Tags `/tags.html` | PASS | PASS | PASS |
| Archive `/archive.html` | PASS | PASS | PASS |
| Long article `/posts/embedded-robotics-learning-roadmap.html` | PASS | PASS | PASS |

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
- `npm run test:browser`: PASS; 21/21 Chromium tests.
- `git diff --check`: PASS (only Git line-ending notices; no whitespace errors).

## Self-review

- No global `overflow-x: hidden` or equivalent document-level clipping was introduced.
- Only named code/table surfaces are allowed to scroll internally in the browser regression test.
- The 44px rule targets actual interactive tags (`a.tag`), not inert Hero label spans or language labels.
- Article back, TOC, previous/next, and related-post navigation links are audited as non-inline 44px targets. Links embedded within `.article-body` prose remain inline and use the WCAG Target Size inline-link exception; they are intentionally excluded from this target audit.
- Disabled liked buttons retain 44px styling even though the browser target audit only requires currently clickable controls.
- Existing focus, skip-link, live-region, optimistic-like, and search-status behavior remained covered by the complete Node and browser suites.
- Changes are limited to the visual CSS, focused tests, the new browser spec, and this report.

## Concerns

- Playwright does not expose a stable cross-platform browser-toolbar zoom API. Actual browser-toolbar 200% zoom remains explicitly assigned to the Task 8 manual checklist; Task 4 automation proves the corresponding real 320 CSS px reflow boundary only.
- Chromium prints the existing `NO_COLOR`/`FORCE_COLOR` warning during Playwright runs; it does not affect results.

## Fix Round 1

### RED

Tests were changed before the CSS fix.

- `npx playwright test tests/browser/reflow-motion.spec.cjs -g "visible interactive targets" --workers=1`: 0 passed, 5 failed. Every representative route reported `.brand` hidden at 320 CSS px.
- `npx playwright test tests/browser/reflow-motion.spec.cjs -g "article visible interactive targets" --workers=1`: 0 passed, 1 failed. The real article reported `.back-link` at 85.64×20.39px and TOC links at 21px high, including a 32px-wide `目录` target.
- The prior CSS `zoom: 2` scenario and divided target measurements were removed. The replacement test directly asserts 320px `innerWidth`, 320px root `clientWidth`, and the active narrow media query.

### GREEN

- Added `.back-link`, `.article-toc a`, `.article-navigation a`, and `.related-posts a` to the real-browser target audit and styled them as wrapping, block-level 44×44 minimum targets.
- Replaced mobile `.brand { display: none; }` with a linked 44px compact logo row. Navigation occupies the following row, preserving DOM/focus order and preventing internal or document overflow.
- `npx playwright test tests/browser/reflow-motion.spec.cjs --workers=1`: PASS, 11/11.

### Fix Round 1 full verification

- `npm run build`: PASS; 9-post index and 7 responsive Hero images generated with no generated-file diff.
- `npm test`: PASS; main Node runner 203/203, plus standalone stats-format 6/6, likes-storage 64/64, and stats-fallback 7/7.
- `npm run test:browser`: PASS; 21/21 Chromium tests.
- `git diff --check`: PASS; no whitespace errors.
