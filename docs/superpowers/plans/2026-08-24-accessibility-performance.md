# WCAG 2.2 AA and Performance Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published site keyboard- and assistive-technology-friendly to the agreed WCAG 2.2 AA scope, then enforce accessibility and performance with real-browser and resource-budget gates.

**Architecture:** Treat semantic markup, focus behavior, live status, reflow, and motion preferences as page contracts backed by Playwright and axe. Keep deterministic byte budgets in the fast Node suite and run Lighthouse against a dedicated local published-site server.

**Tech Stack:** Node.js 22, native HTML/CSS/JavaScript, Playwright Chromium, `@axe-core/playwright`, Lighthouse CI, Node test runner, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-24-static-seo-search-accessibility-design.md`

## Global Constraints

- Execute after the static publishing and search/page-Module plans are complete.
- Target WCAG 2.2 AA; do not describe automated checks as complete legal conformance.
- Require zero axe serious or critical violations on representative states.
- Target mobile Lighthouse Performance >= 0.90 and Accessibility >= 0.95.
- Enforce LCP <= 2500ms, CLS <= 0.1, and TBT <= 200ms in the fixed lab profile.
- Keep CSS <= 50 KiB uncompressed and search index <= 150 KiB gzip.
- Keep all content usable when JavaScript enhancement, statistics, or likes fail.
- Do not stage or commit unrelated feed-data changes already present in the worktree.
- Follow red-green-refactor and commit only after focused tests pass.

---

### Task 1: Browser Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.cjs`
- Create: `tests/browser/test-server.cjs`
- Create: `tests/browser/smoke.spec.cjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a deterministic HTTP server for built `public/` plus injected in-memory statistics.
- Produces: `npm run test:browser` for Chromium tests.

- [ ] **Step 1: Install browser-test dependencies**

Run: `npm install --save-dev @playwright/test @axe-core/playwright`

Then run: `npx playwright install chromium`

- [ ] **Step 2: Write a failing smoke test**

```js
test('published routes load without page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error));
  for (const route of ['/', '/search.html', '/tags.html', '/archive.html', '/posts/stm32-baremetal-scheduler.html']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
  }
  expect(errors).toEqual([]);
});
```

- [ ] **Step 3: Configure the dedicated server**

Build a small server around `createApp` with an in-memory stats Adapter and content IDs from the generated index. Configure Playwright `webServer.command` as `node tests/browser/test-server.cjs`, base URL `http://127.0.0.1:4173`, one worker in CI, and trace retention on first retry.

- [ ] **Step 4: Verify GREEN**

Run: `npm run build && npm run test:browser`

Expected: all representative routes load without unhandled browser errors.

- [ ] **Step 5: Ignore browser artifacts and commit**

Add `/playwright-report/` and `/test-results/` to `.gitignore`.

```powershell
git add -- package.json package-lock.json playwright.config.cjs tests/browser/test-server.cjs tests/browser/smoke.spec.cjs .gitignore
git commit -m "test: add published-site browser harness"
```

### Task 2: Landmarks, Skip Links, and Focus Visibility

**Files:**
- Modify: `public/index.html`
- Modify: `public/search.html`
- Modify: `public/tags.html`
- Modify: `public/archive.html`
- Modify: `public/post.html`
- Modify: `scripts/article-template.js`
- Modify: `public/assets/css/style.css`
- Modify: `tests/visual-system.test.cjs`
- Create: `tests/browser/keyboard.spec.cjs`

**Interfaces:**
- Produces: consistent `#main-content`, `.skip-link`, `aria-current`, focus-ring, and sticky-offset contracts.

- [ ] **Step 1: Add failing markup and keyboard tests**

Assert every published page has a first-focusable skip link and one main landmark. In Playwright, press Tab, activate the link, and assert `#main-content` is focused or is the location target. Assert current navigation exposes `aria-current="page"`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/visual-system.test.cjs && npx playwright test tests/browser/keyboard.spec.cjs`

Expected: FAIL because skip links and consistent main IDs are absent.

- [ ] **Step 3: Implement shared semantic markup**

Add `<a class="skip-link" href="#main-content">跳到主要内容</a>` immediately after `<body>` and `id="main-content" tabindex="-1"` to main. Have `SiteShell.init` set exactly one `aria-current="page"`.

- [ ] **Step 4: Implement focus and sticky offsets**

Use a visible, high-contrast `:focus-visible` outline with `outline-offset`, reveal `.skip-link` on focus, and set `scroll-margin-top` for main and article headings. Do not remove outlines globally.

- [ ] **Step 5: Verify both themes and commit**

Run: `node --test tests/visual-system.test.cjs tests/site-shell.test.cjs && npx playwright test tests/browser/keyboard.spec.cjs`

```powershell
git add -- public/index.html public/search.html public/tags.html public/archive.html public/post.html scripts/article-template.js public/assets/css/style.css tests/visual-system.test.cjs tests/browser/keyboard.spec.cjs public/posts
git commit -m "feat: add keyboard landmarks and focus visibility"
```

### Task 3: Accessible Dynamic Search and Like Status

**Files:**
- Modify: `public/search.html`
- Modify: `public/assets/js/search-page.js`
- Modify: `public/assets/js/site-shell.js`
- Modify: `public/assets/js/article-page.js`
- Modify: `public/assets/js/home-page.js`
- Modify: `tests/search-page.test.cjs`
- Modify: `tests/article-page.test.cjs`
- Create: `tests/browser/dynamic-status.spec.cjs`

**Interfaces:**
- Consumes: `SiteShell.announce(root, message)`.
- Produces: polite status announcements for search and likes, with errors retaining recovery controls.

- [ ] **Step 1: Write failing live-region tests**

Assert the visible search label is associated with the input, results use `aria-busy` only while loading, completion announces exactly one result-count message, and failure exposes a real retry button. Assert successful and rolled-back likes update the shared polite live region.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/search-page.test.cjs tests/article-page.test.cjs && npx playwright test tests/browser/dynamic-status.spec.cjs`

Expected: FAIL on missing or duplicate announcements.

- [ ] **Step 3: Implement controlled announcements**

Keep one visually hidden `role="status" aria-live="polite" aria-atomic="true"` element per page. Clear then update it once per completed user action. Never announce each search result individually.

- [ ] **Step 4: Implement accessible error recovery**

On index failure, preserve input and URL, set `aria-busy="false"`, render a Retry button, and focus only when failure follows explicit submission—not during ordinary debounced typing.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/search-page.test.cjs tests/article-page.test.cjs tests/home-page.test.cjs && npx playwright test tests/browser/dynamic-status.spec.cjs`

```powershell
git add -- public/search.html public/assets/js/search-page.js public/assets/js/site-shell.js public/assets/js/article-page.js public/assets/js/home-page.js tests/search-page.test.cjs tests/article-page.test.cjs tests/browser/dynamic-status.spec.cjs
git commit -m "feat: announce search and like state accessibly"
```

### Task 4: Reflow, Touch Targets, and Reduced Motion

**Files:**
- Modify: `public/assets/css/style.css`
- Modify: `public/assets/js/home-effects.js`
- Modify: `public/assets/js/ui-effects.js`
- Modify: `public/assets/js/home-page.js`
- Modify: `tests/home-effects.test.cjs`
- Modify: `tests/ui-effects.test.cjs`
- Create: `tests/browser/reflow-motion.spec.cjs`

**Interfaces:**
- Preserves: `HomeEffects.init(root)` returning without animation binding for coarse pointers or reduced motion.
- Produces: no page-level horizontal overflow at 320 CSS px or 200% zoom-equivalent viewport.

- [ ] **Step 1: Write failing reflow and motion tests**

At 320×800, assert `document.documentElement.scrollWidth <= clientWidth`; allow only code/table wrappers to overflow internally. Emulate reduced motion and assert no animation frame is scheduled, reveal content is immediately visible, and pagination scroll behavior is `auto`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/home-effects.test.cjs tests/ui-effects.test.cjs && npx playwright test tests/browser/reflow-motion.spec.cjs`

Expected: FAIL on remaining overflow, animation, or smooth-scroll behavior.

- [ ] **Step 3: Fix reflow and target sizing**

Apply `min-width: 0` to flex/grid children, keep code and tables in named scroll wrappers, and enforce `min-inline-size`/`min-block-size: 44px` for navigation, pagination, search controls, tags when interactive, and like buttons.

- [ ] **Step 4: Centralize simple-effects detection**

Use the existing fine-hover/coarse-pointer and reduced-motion media queries. HomeEffects must not obtain Canvas context or bind pointer listeners when simple effects are preferred. UiEffects must render reveal targets visible without observers.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/home-effects.test.cjs tests/ui-effects.test.cjs tests/visual-system.test.cjs && npx playwright test tests/browser/reflow-motion.spec.cjs`

```powershell
git add -- public/assets/css/style.css public/assets/js/home-effects.js public/assets/js/ui-effects.js public/assets/js/home-page.js tests/home-effects.test.cjs tests/ui-effects.test.cjs tests/browser/reflow-motion.spec.cjs
git commit -m "fix: guarantee reflow and reduced motion"
```

### Task 5: axe Accessibility Gate and Manual Checklist

**Files:**
- Create: `tests/browser/accessibility.spec.cjs`
- Create: `docs/accessibility-checklist.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run test:a11y` with zero serious/critical axe violations across representative states.
- Produces: a release checklist for requirements automation cannot establish.

- [ ] **Step 1: Write the axe test matrix**

```js
const results = await new AxeBuilder({ page }).analyze();
const blocking = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
expect(blocking).toEqual([]);
```

Run it for homepage dark/light, empty search, populated search, no-result search, tags, archive, legacy error, and one article.

- [ ] **Step 2: Run and record RED findings**

Run: `npx playwright test tests/browser/accessibility.spec.cjs`

Expected: initial failures are copied into the task notes before fixes; do not disable axe rules to obtain green.

- [ ] **Step 3: Fix root causes**

Correct names, roles, relationships, heading order, contrast tokens, and invalid ARIA in owning templates or Modules. Add narrowly-scoped exclusions only for third-party code that cannot affect rendered semantics, with an inline reason.

- [ ] **Step 4: Write the manual WCAG checklist**

Include exact routes and pass/fail fields for: both-theme contrast, keyboard order, screen-reader search and like announcements, 200% zoom, 320px reflow, reduced motion, table/code scrolling, and touch target inspection. State that passing automation is not a conformance certification.

- [ ] **Step 5: Add script, verify, and commit**

Set `"test:a11y": "playwright test tests/browser/accessibility.spec.cjs"`.

Run: `npm run test:a11y`

```powershell
git add -- tests/browser/accessibility.spec.cjs docs/accessibility-checklist.md package.json
git commit -m "test: enforce representative accessibility states"
```

### Task 6: Static Resource Budgets

**Files:**
- Create: `tests/performance-budget.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: deterministic CSS, search-index, script-map, and article-request budgets in the fast Node suite.

- [ ] **Step 1: Write failing budget tests**

```js
assert.ok(fs.statSync('public/assets/css/style.css').size <= 50 * 1024);
assert.ok(zlib.gzipSync(fs.readFileSync('public/assets/search-index.json')).length <= 150 * 1024);
assert.doesNotMatch(homeHtml, /search-core\.js|article-page\.js/);
assert.doesNotMatch(articleHtml, /assets\/posts\/[^"']+\.json/);
```

Also assert each HTML page has exactly one page Module and only declared shared dependencies.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/performance-budget.test.cjs`

Expected: FAIL on any current over-budget artifact or script-map mismatch.

- [ ] **Step 3: Reduce measured waste**

Remove unused CSS selectors only after mapping them to generated and hand-authored HTML. Remove duplicate helpers from page Modules. If the search gzip budget fails, emit a metadata manifest plus alphabetical/ID content shards and have SearchPage fetch shards only after query normalization; do not raise the budget.

- [ ] **Step 4: Add budget test to `npm test` and commit**

Run: `npm run build && node --test tests/performance-budget.test.cjs && npm test`

```powershell
git add -- tests/performance-budget.test.cjs package.json public/assets/css/style.css public/assets/js public/assets/search-index.json
git commit -m "perf: enforce published resource budgets"
```

### Task 7: Lighthouse CI and Deployment Gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `.lighthouserc.cjs`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `npm run test:lighthouse` for fixed representative URLs.
- Preserves: deploy only after build, unit, accessibility, and performance gates pass.

- [ ] **Step 1: Install Lighthouse CI**

Run: `npm install --save-dev @lhci/cli`

- [ ] **Step 2: Add the initial Lighthouse configuration**

Configure `collect.startServerCommand` as `node tests/browser/test-server.cjs`, three runs, mobile preset, and URLs `/`, `/search.html?q=STM32`, and `/posts/stm32-baremetal-scheduler.html`. Configure assertions:

```js
assertions: {
  'categories:performance': ['error', { minScore: 0.90 }],
  'categories:accessibility': ['error', { minScore: 0.95 }],
  'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
  'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
  'total-blocking-time': ['error', { maxNumericValue: 200 }]
}
```

- [ ] **Step 3: Run Lighthouse and fix measured regressions**

Run: `npm run build && npm run test:lighthouse`

Expected: all assertions pass across the median run. Fix only measured causes; do not weaken thresholds.

- [ ] **Step 4: Add CI browser setup and gates**

After build, install Chromium with `npx playwright install --with-deps chromium`, then run `npm test`, `npm run test:a11y`, and `npm run test:lighthouse` before artifact upload. Keep feed fetching after verification so volatile remote data does not change test fixtures.

- [ ] **Step 5: Verify workflow and commit**

Run locally: `npm run build && npm test && npm run test:a11y && npm run test:lighthouse`

```powershell
git add -- package.json package-lock.json .lighthouserc.cjs .github/workflows/deploy.yml
git commit -m "ci: gate deployment on accessibility and performance"
```

### Task 8: Final Production Verification

**Files:**
- Verify all files changed by the three implementation plans.
- Modify only files required to correct an observed in-scope regression.

**Interfaces:**
- Produces: one clean, reproducible production build with documented manual verification status.

- [ ] **Step 1: Run the full automated gate**

```powershell
npm run build
npm test
npm run test:browser
npm run test:a11y
npm run test:lighthouse
npm audit
git diff --check
```

Expected: every command exits 0 and audit has no high-severity vulnerability.

- [ ] **Step 2: Inspect published SEO and retired references**

```powershell
Select-String -Path public\*.html,public\posts\*.html -Pattern 'main\.js|post-loader\.js|post-view\.js|post\.html\?id='
Get-Item public\sitemap.xml,public\rss.xml,public\assets\search-index.json
```

Expected: no retired runtime references; discovery and search outputs exist.

- [ ] **Step 3: Complete the manual checklist**

Serve the production build and record pass/fail for every item in `docs/accessibility-checklist.md` at desktop, 320px, 390px, 200% zoom, light theme, dark theme, keyboard-only, reduced motion, and a screen reader available on the workstation.

- [ ] **Step 4: Correct and reverify any observed regression**

For each failure, add or tighten the smallest owning automated test before the fix, rerun the focused test, then repeat Steps 1–3. Do not create an empty correction commit.

- [ ] **Step 5: Commit verification-only corrections if needed**

```powershell
git diff --name-only | ForEach-Object { git add -- $_ }
git commit -m "fix: address release verification findings"
```

Skip this commit when verification required no code or documentation changes.
