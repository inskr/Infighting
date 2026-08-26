# Phase 3 final fix wave

## Scope

This report covers every finding in `final-review.md` against baseline `993a6f1`. The worktree was rebuilt after the source/template changes. No original-workspace feed data was read or changed.

## RED / GREEN record

| Finding | RED evidence | GREEN evidence |
| --- | --- | --- |
| Important 1 — task-list names | The review's fresh axe scan found 66 critical `label` violations in the generated robotics roadmap. | `tests/post-render.test.cjs` adds the labelled checked/unchecked task-list contract; `scripts/article-template.js` wraps task items in their text label; the generated article was rebuilt. `npm run test:a11y` later passed 13/13, including every generated article. |
| Important 2 — authoritative Search snippets | The original same-ID/metadata handoff test preserved `Metadata summary`; browser review found zero final `<mark>` elements. | RED was replaced with a test requiring the hit-adjacent snippet and `<mark>`. The visible fingerprint now includes rendered snippet/ranges; the focused Node contract passed. The browser preview contract passed with five final highlights. A follow-up RED asserted this reconciliation builds no new card when metadata already agrees; the minimal in-place summary/highlight reconciliation passed while the changed-metadata replacement contract still passed. |
| Important 3 — visible recovery / Retry geometry | Search produced an empty visual result region or only a Retry control; review measured Retry at 296×800. | Node and browser tests require visible empty/error messages, clear-query and tag recovery, a focused submitted Retry, and 320px 44px–100px Retry geometry. Search now renders state containers and uses ordinary button classes with non-stretching alignment. Focused and full browser checks passed before the later performance-only optimization. |
| Important 4 — scroller focus | Real Tab navigation reached dark-theme overflow scrollers with browser `outline: auto`. | New both-theme real-Tab test first failed with `outlineStyle: auto`, then passed after explicit `:focus-visible` focus-token styling for `pre` and `.table-wrapper`. |
| Minor 1 — radar heading shape | New publication-shape test failed because `第1章 绪论` rendered as `h4` after the Part `h2`. | The source rank changed from `###` to `##`; its generated page and JSON were rebuilt. The focused render test passed with `h2` then `h3`. |
| Minor 2 — bounds diagnostic | Reduced-motion article reflow initially reported code/table descendants outside the viewport even though they were clipped inside the explicitly allowed scrollers. | Reflow now asserts `boundsOverflow` after reduced motion and excludes only the allowed scrollers plus their clipped descendants. The focused 20-test keyboard/reflow browser run passed. |
| Minor 3 — page semantics | Existing contract only matched presence of a main skip target. | The all-published-page contract now tokenizes every published page and asserts exactly one `main#main-content`, one `h1`, and one skip link to that main. It passed in the focused Node run. |

## Verification record

- `npm run build` — passed after the source/template changes.
- `npm test` — passed before the final Search performance optimization.
- `npm run test:browser` — passed 51/51 before the final Search performance optimization.
- `npm run test:a11y` — passed 13/13 before the final Search performance optimization.
- `npm audit --omit=dev` — passed: 0 production vulnerabilities.
- `git diff --check` — clean before the final Search performance optimization.

### Lighthouse status — intentionally not green

The first formal fixed-profile 3×3 collection generated nine reports, but median-run assertion failed on `/search.html?q=STM32`: TBT was **203 ms** against the unchanged `<= 200 ms` threshold. Diagnostics attributed the blocking long task to `assets/js/search-page.js` during authoritative handoff. A second 3×3 collection after the first minimal SearchCore allocation optimization still failed at **204 ms**. A subsequent minimal change avoids rebuilding matching metadata cards during snippet/range reconciliation; its focused Node RED/GREEN passed and the site was rebuilt.

The user then explicitly instructed that no gates be rerun. Therefore the final SearchCore/reconciliation optimization has **not** received a formal Lighthouse rerun, and this report does **not** claim that the Lighthouse gate passes. The 360ms curtain, static Search Hero, `median-run` configuration, URLs, thresholds, CSP, canonical/sitemap/RSS generation, and reduced-motion contracts were not altered.

## Self-review / concerns

- Read-only diff audit found only the seven requested finding areas, generated publication outputs, and the Search critical-style test adjustment required because authoritative content now settles before the CSS-only geometry comparison.
- No Lighthouse/test-server/LHCI process remained when execution stopped. Ignored `.lighthouseci` artifacts were left untouched rather than broadly deleted.
- Remaining release concern: rerun the formal Lighthouse 3×3 and assertion after the user permits it. Do not report the performance gate as passing until then.
