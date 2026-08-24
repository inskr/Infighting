# Task 5C Report: Home Page Module

## Delivered

- Added UMD/CommonJS `HomePage.init(root)` in `public/assets/js/home-page.js` with browser auto-initialization.
- Moved durable-post filtering, four-card pagination, `?page=` history/popstate handling, page clamping, accessible `aria-current` state, and reduced-motion-aware scrolling out of `main.js`.
- Moved current EN/ZH feed rendering, update dates, readable missing/empty states, language labels, escaping, and `UrlPolicy`-approved external links into HomePage.
- Kept Home cards on `ContentCards`, with the fetched statistics cache and stored-like state available before the first render. HomePage now owns delegated optimistic likes, successful persistence, and failure rollback.
- Updated `index.html` to load only Feed data, durable Posts, Stats, LikesStorage, UrlPolicy, SiteShell, ContentCards, HomePage, and the existing effects script. It no longer loads `main.js`, archive data, or another page's runtime.
- Removed extracted home/feed/list/like behavior from `main.js`; the file remained for later-owned transitional article/reveal cleanup at the time of the initial Task 5C commit.
- Added Home behavior/runtime coverage to `npm test` and updated shared-card, shell, visual resource-map, cache, and module-caller contracts.

## TDD Evidence

- RED: `node --test tests/home-page.test.cjs` failed all seven cases because `public/assets/js/home-page.js` did not exist.
- GREEN: the same seven cases passed after the minimal HomePage implementation.
- Resource-map RED: `node --test tests/site-shell.test.cjs` then failed because `index.html` still referenced `main.js` and lacked HomePage; it passed after the page script swap.

## Verification

- Focused home/reveal/content/visual/security/cache set: 39 passing.
- Syntax: `node --check` passed for HomePage, the reduced transitional `main.js`, and the Home test.
- Build: `npm run build` succeeded, generating the nine-post index and seven responsive Hero images without residual generated changes.
- Full: `npm test` passed 199 Node cases plus all stats-format, likes-storage, and stats-fallback checks.
- `git diff --check` completed without whitespace errors.

## Self-Review

- Pagination clears stale controls, filters page records, clamps invalid/out-of-range page values, preserves static fallback links, and uses `auto` rather than smooth scrolling for reduced-motion users.
- Feed markup escapes caller-controlled text and routes external hrefs through `UrlPolicy`; missing and per-board empty states remain readable.
- Cached counts and persisted likes are rendered through `ContentCards`; the delegated handler prevents duplicate/pending likes and restores cache, text, and enabled state after failures.
- Home's dependency order is covered in both shell and published-page contracts, including explicit exclusions for archive, search, tags, article, compatibility, and `main.js` resources.
- The initial Task 5C tree left only article/reveal responsibilities in `main.js`; no Home feed, list, pagination, or like-delegation implementation remained there.

## Fix Round 1

### Review Finding and Root Cause

The reveal initializer was orphaned in `main.js` after Home, Tags, and Archive stopped loading that script. The existing reveal test executed the dead file directly, so it proved the threshold behavior in isolation while missing the published bootstrap regression. A verbatim one-shot move would also have missed Home and Tags cards rendered after asynchronous statistics loading.

### Fix

- Added `createRevealController(root)` to the loaded `ui-effects.js` bootstrap.
- The controller scans initial Hero, page intro, tag cloud, card, article, board, and archive-day surfaces, retaining the threshold-0 intersection behavior used by very tall content.
- A `MutationObserver` enhances cards and boards inserted after page rendering, including descendants of a rendered batch.
- Reduced-motion and missing-IntersectionObserver environments receive no `reveal` class, keeping content immediately visible without animation.
- Replaced the dead-main reveal test with loaded-UiEffects bootstrap, dynamic insertion, tall-content, and non-animating fallback coverage.
- Removed the duplicate reveal implementation and invocation from `main.js`; it now contains only transitional article rendering.

### TDD and Verification

- RED: all three revised `tests/reveal.test.cjs` cases failed because UiEffects neither exported nor bootstrapped a reveal controller.
- GREEN: reveal plus UI effects passed 13 cases after the controller was added.
- Focused Home/Tags/Archive/UI/reveal/article/visual set: 60 passing.
- `npm run build`: passed with nine posts and seven responsive Hero images generated without residual output changes.
- `npm test`: 201 Node cases passing plus all stats-format, likes-storage, and stats-fallback checks.
- Syntax checks and `git diff --check`: clean.
