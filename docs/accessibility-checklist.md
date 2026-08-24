# Accessibility release checklist

Passing `npm run test:a11y` only establishes that the tested states have no axe findings with `serious` or `critical` impact. Automated checks cannot establish complete WCAG conformance, legal compliance, or certification. Complete this checklist with real browsers and assistive technology for every release candidate.

## Test record

| Field | Value |
| --- | --- |
| Release / commit |  |
| Base URL |  |
| Environment (local / staging / production) |  |
| Date (YYYY-MM-DD) |  |
| Tester |  |
| OS and version |  |
| Browser and version |  |
| Screen reader and version |  |
| Display / device |  |
| Notes about extensions, zoom, or input hardware |  |

For every check, select exactly one result and add reproducible evidence. Use **Not verified** only when the check was not performed; do not treat it as a pass.

## Manual checks

| ID | Routes and setup | Procedure and acceptance criteria | Result | Evidence / notes |
| --- | --- | --- | --- | --- |
| M01 — Both-theme contrast | `/`, `/search.html`, `/tags.html`, `/archive.html`, `/post.html?id=does-not-exist`, `/posts/stm32-baremetal-scheduler.html` | On every route, use the site theme button to inspect both dark and light themes. Check normal text, muted/meta text, links, buttons, focus indicators, placeholders, selected/current navigation, glass surfaces, code, tables, and text over the hero image. Measure uncertain combinations: normal text is at least 4.5:1, large text at least 3:1, and essential component/focus boundaries at least 3:1 against adjacent colours. Information is not conveyed by colour alone. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M02 — Keyboard order and operation | Same six routes as M01; keyboard only, starting with a fresh navigation | Press `Tab` from the address bar. The skip link is first and moves focus to `main`; subsequent focus follows visual/reading order through header, page controls, content links, like controls, article TOC/navigation, and footer without traps or unexpected jumps. `Shift+Tab`, `Enter`, and `Space` work where applicable. Focus is always visible in both themes. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M03 — Screen-reader search announcements | `/search.html`; screen reader running. Test (a) initial empty state, (b) submit `STM32`, (c) submit `zz-no-accessibility-match`, and (d) clear the query. | The search field is announced as “搜索关键词” and the form as search. Each submitted query announces loading once, then exactly one completion (“找到 …” or “没有找到 …”). Results are discoverable after the completion message, the no-result state is understandable, and clearing returns to “输入关键词开始搜索。” without moving focus unexpectedly. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M04a — Screen-reader like success | `/` and `/posts/stm32-baremetal-scheduler.html`; use a fresh profile or clear site storage before each run so the like control is enabled | Move to the like button by screen-reader controls, activate it once, and wait for the request to settle. Its accessible name/state identifies the action, pending state is understandable, success announces “点赞成功，当前点赞数 …” once, the count matches the visible count, and the completed control is announced as unavailable/disabled. Verify on both a home card and the static article. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M04b — Screen-reader like recovery | `/posts/stm32-baremetal-scheduler.html`; load the page with an enabled like button, then use browser request blocking/offline mode to make `/api/content/stm32-baremetal-scheduler/like` fail | Activate Like and wait for settlement. The screen reader announces “点赞失败，已恢复到 …，请重试。” once, the visible count returns to its original value, the button becomes enabled, and focus remains usable. Restore networking after the check. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M05 — Actual browser-toolbar 200% zoom | `/`, `/search.html?q=STM32`, `/tags.html`, `/archive.html`, `/post.html?id=does-not-exist`, `/posts/stm32-baremetal-scheduler.html`; desktop viewport at least 1280 CSS px before zoom | Set zoom to **200% with the browser toolbar/menu** (not DevTools emulation or a CSS transform), reload each exact URL, and use keyboard plus pointer. No text or control is clipped, overlapped, or hidden; navigation and search remain operable; reading order remains sensible; horizontal page scrolling is not required except inside the article table/code regions identified in M08. Record the toolbar zoom value in evidence. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M06 — 320 CSS px reflow | Same six routes as M01; browser responsive mode or a real device at exactly 320 CSS px wide, with page zoom reset to 100% | Reload every route at 320 CSS px. Read from top to bottom and operate navigation, theme, search, tags, like controls, TOC, and article navigation. The document has no horizontal scrolling and content does not overlap or disappear; only the table and code containers in M08 may scroll horizontally. Record the reported CSS viewport width and screenshots. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M07 — Reduced motion | `/` and `/posts/stm32-baremetal-scheduler.html`; enable “Reduce motion” in the OS or browser before launching/reloading | Reload both routes. Content is immediately visible; hero/canvas/reveal/parallax effects do not animate; pagination and fragment navigation do not use smooth scrolling; controls remain usable and state changes remain understandable without motion. Record the OS/browser preference used. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M08 — Table and code scrolling | `/posts/stm32-baremetal-scheduler.html`; test at 320 CSS px and at actual 200% toolbar zoom | With keyboard and pointer/touch, reach every table and fenced code block. Wide content scrolls inside its own visible region without widening the document or hiding adjacent prose. Keyboard focus is visible wherever an internal scroller is keyboard-focusable, and zoom/reflow does not make any row, column, or code line permanently unreachable. | [ ] Pass [ ] Fail [ ] Not verified |  |
| M09 — Touch targets | `/`, `/search.html`, `/tags.html`, `/archive.html`, `/post.html?id=does-not-exist`, `/posts/stm32-baremetal-scheduler.html`; real touch device preferred, otherwise 320 CSS px touch emulation | Inspect and operate brand/navigation links, theme button, pagination, search input/buttons, tags, like buttons, back link, TOC, related/previous/next article links, and external footer links. Project controls intended for interaction provide at least a 44 × 44 CSS px activation area or equivalent non-overlapping spacing; adjacent targets can be selected without activating the wrong item. Record measured exceptions and screenshots. | [ ] Pass [ ] Fail [ ] Not verified |  |

## Failures and follow-up

For each failed item, record the exact route/state, theme, viewport/zoom, assistive technology, expected result, actual result, screenshot or recording, and issue link. Re-run the failed item and any related automated test after the fix; do not change a Fail to Pass without fresh evidence.
