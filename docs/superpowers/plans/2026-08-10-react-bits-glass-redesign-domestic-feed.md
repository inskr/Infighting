# React Bits Glass Redesign and Domestic Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a React Bits-inspired glass visual system with persistent dark/light themes and the supplied hero image, while making domestic daily picks strictly technical and filling shortages only with revalidated previous technical entries.

**Architecture:** Keep the existing static HTML/CSS/JavaScript site. Add one dependency-free theme controller, extend the existing renderer for card spotlight behavior, and keep feed classification/fallback as exported pure functions inside `scripts/fetch-feeds.js` so Node tests can exercise them without network access.

**Tech Stack:** HTML5, CSS custom properties, browser JavaScript, Node.js CommonJS, Node test runner, existing Express static server.

## Global Constraints

- Keep the current native HTML, CSS, and JavaScript architecture and static deployment model.
- Do not add React, WebGL, third-party animation libraries, external fonts, runtime dependencies, or remote image dependencies.
- Keep `public/` as the only published directory.
- Default to dark theme; persist an explicit dark/light choice in browser storage.
- Respect `prefers-reduced-motion`, touch devices, keyboard focus, and browsers without `backdrop-filter`.
- Keep at most eight items per feed board and at least four publishable domestic items.
- Never use stock-market, earnings, financing, valuation, merger, or personnel news as domestic fallback.
- Preserve existing generated feed files when the final domestic set contains fewer than four items.

---

## File Structure

- Create `public/assets/js/theme.js`: synchronous theme bootstrap, button binding, persistence, and CommonJS-testable helpers.
- Create `public/assets/images/hero-ink.png`: repository copy of the exact user-supplied cover image.
- Create `tests/theme.test.cjs`: theme normalization, bootstrap, persistence, button, and storage-failure tests.
- Create `tests/visual-system.test.cjs`: static contracts for all page headers, script order, Hero markup, CSS theme selectors, image presence, and spotlight hook.
- Modify `public/index.html`: shared glass header, theme control, and home Hero.
- Modify `public/tags.html`, `public/archive.html`, `public/post.html`, `public/about.html`: shared glass header, theme bootstrap, and compact page surfaces where applicable.
- Modify `public/assets/css/style.css`: semantic dark/light tokens and the full responsive glass visual system.
- Modify `public/assets/js/main.js`: pointer spotlight initialization for static and dynamically rendered glass surfaces.
- Modify `scripts/fetch-feeds.js`: finance-first blocking, engineering-aware strict classification, strict-only selection, previous-feed parsing, and domestic fallback merge.
- Modify `tests/feed-topic-filter.test.cjs`: strict selection and previous-period fallback contracts.
- Modify `package.json`: include new Node test files in the full test command.
- Optionally update generated `public/assets/js/feed-data.js` and `public/assets/js/feed-archive.js` only when the live fetch passes the four-item publication gate.

---

### Task 1: Theme controller

**Files:**
- Create: `public/assets/js/theme.js`
- Create: `tests/theme.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `normalizeTheme(value) -> "dark" | "light" | null`
- Produces: `createThemeController(root) -> { bootstrap(), bind(), getTheme(), setTheme(theme) }`
- Consumes: `root.document`, optional `root.localStorage`, and buttons matching `[data-theme-toggle]`

- [ ] **Step 1: Write the failing theme tests**

Create `tests/theme.test.cjs` with concrete fake DOM/storage objects and these cases:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createThemeController, normalizeTheme } = require('../public/assets/js/theme');

function fixture(savedTheme) {
  const attrs = {};
  const listeners = {};
  const button = {
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(name, handler) { listeners[name] = handler; },
  };
  const document = {
    readyState: 'complete',
    documentElement: {
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name] || null; },
    },
    querySelectorAll(selector) {
      return selector === '[data-theme-toggle]' ? [button] : [];
    },
  };
  const storage = {
    value: savedTheme,
    getItem() { return this.value; },
    setItem(key, value) { this.value = value; },
  };
  return { root: { document, localStorage: storage }, attrs, button, listeners, storage };
}

test('normalizes only supported themes', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('system'), null);
});

test('defaults to dark and applies a saved light theme', () => {
  const first = fixture(null);
  assert.equal(createThemeController(first.root).bootstrap(), 'dark');
  assert.equal(first.attrs['data-theme'], 'dark');

  const saved = fixture('light');
  assert.equal(createThemeController(saved.root).bootstrap(), 'light');
  assert.equal(saved.attrs['data-theme'], 'light');
});

test('binds the theme button, toggles, persists, and updates accessibility state', () => {
  const state = fixture(null);
  const controller = createThemeController(state.root);
  controller.bootstrap();
  controller.bind();
  assert.equal(state.button.attrs['aria-pressed'], 'false');
  state.listeners.click();
  assert.equal(controller.getTheme(), 'light');
  assert.equal(state.storage.value, 'light');
  assert.equal(state.button.attrs['aria-pressed'], 'true');
  assert.equal(state.button.attrs['aria-label'], '切换到深色主题');
});

test('storage failures do not prevent theme initialization or switching', () => {
  const state = fixture(null);
  state.root.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const controller = createThemeController(state.root);
  assert.equal(controller.bootstrap(), 'dark');
  assert.doesNotThrow(() => controller.setTheme('light'));
  assert.equal(controller.getTheme(), 'light');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/theme.test.cjs`

Expected: FAIL because `public/assets/js/theme.js` does not exist.

- [ ] **Step 3: Implement the minimal dependency-free controller**

Implement a UMD-compatible module that exports the two tested functions in Node and bootstraps immediately in a browser:

```js
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    var controller = api.createThemeController(root);
    controller.bootstrap();
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', controller.bind);
    } else {
      controller.bind();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var STORAGE_KEY = 'infighting-theme';
  function normalizeTheme(value) {
    return value === 'dark' || value === 'light' ? value : null;
  }
  function createThemeController(root) {
    var current = 'dark';
    function syncButtons() {
      root.document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
        var isLight = current === 'light';
        button.setAttribute('aria-pressed', String(isLight));
        button.setAttribute('aria-label', isLight ? '切换到深色主题' : '切换到浅色主题');
        button.setAttribute('title', isLight ? '切换到深色主题' : '切换到浅色主题');
      });
    }
    function setTheme(theme) {
      current = normalizeTheme(theme) || 'dark';
      root.document.documentElement.setAttribute('data-theme', current);
      try { root.localStorage.setItem(STORAGE_KEY, current); } catch (error) {}
      syncButtons();
      return current;
    }
    function bootstrap() {
      var stored = null;
      try { stored = root.localStorage.getItem(STORAGE_KEY); } catch (error) {}
      current = normalizeTheme(stored) || 'dark';
      root.document.documentElement.setAttribute('data-theme', current);
      return current;
    }
    function bind() {
      syncButtons();
      root.document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
          setTheme(current === 'dark' ? 'light' : 'dark');
        });
      });
    }
    return { bootstrap: bootstrap, bind: bind, getTheme: function () { return current; }, setTheme: setTheme };
  }
  return { normalizeTheme: normalizeTheme, createThemeController: createThemeController };
});
```

- [ ] **Step 4: Add the theme test to `npm test` and confirm GREEN**

Add `tests/theme.test.cjs` to the existing `node --test` file list in `package.json`.

Run: `node --test tests/theme.test.cjs`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the theme controller**

```powershell
git add -- public/assets/js/theme.js tests/theme.test.cjs package.json
git commit -m "feat(theme): add persistent dark and light modes"
```

---

### Task 2: Shared markup and supplied Hero asset

**Files:**
- Create: `public/assets/images/hero-ink.png`
- Create: `tests/visual-system.test.cjs`
- Modify: `public/index.html`
- Modify: `public/tags.html`
- Modify: `public/archive.html`
- Modify: `public/post.html`
- Modify: `public/about.html`
- Modify: `package.json`

**Interfaces:**
- Consumes: `public/assets/js/theme.js`
- Produces: `[data-theme-toggle]`, `.nav-shell`, `.hero`, `.hero-panel`, `.hero-actions`, and `.page-intro` markup hooks
- Produces: `public/assets/images/hero-ink.png` loaded only from the same origin

- [ ] **Step 1: Write the failing shared-markup contract**

Create `tests/visual-system.test.cjs`:

```js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PUBLIC = path.join(__dirname, '..', 'public');
const PAGES = ['index.html', 'tags.html', 'archive.html', 'post.html', 'about.html'];

test('every page bootstraps theme before loading the main stylesheet and exposes the toggle', () => {
  for (const page of PAGES) {
    const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
    assert.match(html, /<script src="assets\/js\/theme\.js"><\/script>/, page);
    assert.ok(html.indexOf('assets/js/theme.js') < html.indexOf('assets/css/style.css'), page);
    assert.match(html, /data-theme-toggle/, page);
    assert.match(html, /class="nav-shell"/, page);
  }
});

test('home page uses the local supplied image in an accessible Hero', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  assert.match(html, /class="hero glass-surface"/);
  assert.match(html, /assets\/images\/hero-ink\.png/);
  assert.match(html, /href="#daily-section"/);
  assert.match(html, /href="#posts-title"/);
  assert.ok(fs.existsSync(path.join(PUBLIC, 'assets', 'images', 'hero-ink.png')));
});
```

- [ ] **Step 2: Run the contract and confirm RED**

Run: `node --test tests/visual-system.test.cjs`

Expected: FAIL because pages have no theme bootstrap/toggle/Hero and the image has not been copied.

- [ ] **Step 3: Copy the exact supplied image into the published asset tree**

```powershell
New-Item -ItemType Directory -Force -Path 'public\assets\images'
Copy-Item -LiteralPath 'C:\Users\12618\AppData\Local\Temp\codex-clipboard-fa18014d-2174-4dd5-b3f8-2eb13adb1c23.png' -Destination 'public\assets\images\hero-ink.png'
```

- [ ] **Step 4: Add theme bootstrap and the shared glass header to all five pages**

Load `assets/js/theme.js` synchronously before `assets/css/style.css`. Replace each header interior with the same semantic structure:

```html
<div class="nav-shell glass-surface">
  <a class="brand" href="index.html" aria-label="Infighting 首页">
    <span class="logo" aria-hidden="true">&gt;_</span>
    <span class="brand-copy">Infighting<small>嵌入式 × 边缘计算</small></span>
  </a>
  <div class="nav-actions">
    <nav class="site-nav" aria-label="主导航">...</nav>
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="切换到浅色主题" aria-pressed="false">
      <span class="theme-icon theme-icon-sun" aria-hidden="true">☼</span>
      <span class="theme-icon theme-icon-moon" aria-hidden="true">☾</span>
    </button>
  </div>
</div>
```

- [ ] **Step 5: Add the home Hero before daily picks**

Use this content structure inside `public/index.html`:

```html
<section class="hero glass-surface" aria-labelledby="hero-title">
  <img class="hero-image" src="assets/images/hero-ink.png" alt="蓝黑色流体光影抽象封面">
  <div class="hero-scrim" aria-hidden="true"></div>
  <div class="hero-panel">
    <span class="eyebrow"><span class="status-dot"></span> Embedded systems · Edge AI</span>
    <h1 id="hero-title">在硬件与智能的边界，构建真正运行的系统。</h1>
    <p>记录从 MCU、实时系统到端侧推理部署的工程实践，也筛选值得关注的技术动态。</p>
    <div class="hero-tags" aria-label="核心技术方向">
      <span>STM32</span><span>Embedded Linux</span><span>Edge AI</span>
    </div>
    <div class="hero-actions">
      <a class="button button-primary" href="#daily-section">浏览每日精选</a>
      <a class="button button-ghost" href="#posts-title">阅读技术文章</a>
    </div>
  </div>
</section>
```

Wrap the heading and description on tags/archive/about pages in `.page-intro.glass-surface`; keep the dynamic post container unchanged.

- [ ] **Step 6: Add the visual contract to `npm test` and confirm GREEN**

Add `tests/visual-system.test.cjs` to the Node test file list.

Run: `node --test tests/visual-system.test.cjs`

Expected: 2 tests PASS.

- [ ] **Step 7: Commit shared markup and the Hero**

```powershell
git add -- public/index.html public/tags.html public/archive.html public/post.html public/about.html public/assets/images/hero-ink.png tests/visual-system.test.cjs package.json
git commit -m "feat(ui): add glass navigation and image hero"
```

---

### Task 3: Full glass visual system and spotlight interaction

**Files:**
- Modify: `public/assets/css/style.css`
- Modify: `public/assets/js/main.js`
- Modify: `tests/visual-system.test.cjs`

**Interfaces:**
- Consumes: `data-theme="dark|light"`, `.glass-surface`, `.hero`, `.page-intro`, existing card/tag selectors
- Produces: CSS variables `--surface`, `--surface-strong`, `--border`, `--pointer-x`, and `--pointer-y`
- Produces: `initGlassSpotlight()` called after all dynamic render functions

- [ ] **Step 1: Extend the visual contract before editing styles**

Add assertions that `style.css` contains `[data-theme="light"]`, `.glass-surface::before`, `.hero-image`, `.theme-toggle`, `.tag-cloud a.active`, `@supports not ((backdrop-filter`, and `@media (prefers-reduced-motion: reduce)`. Assert that `main.js` contains `function initGlassSpotlight()` and sets `--pointer-x`/`--pointer-y`.

- [ ] **Step 2: Run the contract and confirm RED**

Run: `node --test tests/visual-system.test.cjs`

Expected: shared markup tests pass; new CSS/interaction assertions fail.

- [ ] **Step 3: Replace the design tokens with concrete dark/light semantics**

Start `style.css` with these roles, then update existing rules to consume them:

```css
:root {
  color-scheme: dark;
  --bg: #060010;
  --bg-elevated: #0b0715;
  --surface: rgba(16, 18, 35, 0.66);
  --surface-strong: rgba(17, 21, 40, 0.9);
  --ink: #f7f8ff;
  --text: #c8ccdc;
  --muted: #8f96ad;
  --border: rgba(255, 255, 255, 0.11);
  --accent: #67e8f9;
  --accent-strong: #22d3ee;
  --accent-alt: #818cf8;
  --accent-bg: rgba(34, 211, 238, 0.1);
  --shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
  --radius: 22px;
}

[data-theme="light"] {
  color-scheme: light;
  --bg: #eef3fb;
  --bg-elevated: #f8fbff;
  --surface: rgba(255, 255, 255, 0.7);
  --surface-strong: rgba(255, 255, 255, 0.94);
  --ink: #101426;
  --text: #38415b;
  --muted: #68728b;
  --border: rgba(36, 54, 86, 0.13);
  --accent: #0891b2;
  --accent-strong: #0e7490;
  --accent-alt: #4f46e5;
  --accent-bg: rgba(8, 145, 178, 0.09);
  --shadow: 0 24px 70px rgba(38, 55, 86, 0.13);
}
```

- [ ] **Step 4: Implement the layout and glass component rules**

Apply a layered radial-gradient page background, 1120px content width, floating sticky header, two-column desktop Hero, full-width image, left scrim, glass panel, gradient buttons, consistent focus-visible rings, and glass surfaces for `.post-card`, `.board`, `.article`, `.about-card`, `.page-intro`, and `.archive-day`.

The glass highlight must use the pointer variables without changing layout:

```css
.glass-surface { position: relative; isolation: isolate; overflow: hidden; }
.glass-surface::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(420px circle at var(--pointer-x, 50%) var(--pointer-y, 50%), rgba(103, 232, 249, 0.11), transparent 58%);
  opacity: 0;
  transition: opacity 180ms ease;
}
.glass-surface:hover::before { opacity: 1; }
```

Style theme-aware tag pills, active navigation, feed metadata, pagination, code/article surfaces, and footer. In the existing mobile breakpoint, stack the Hero, use at least 44px theme-toggle hit area, allow horizontal nav scrolling when required, and reduce card padding.

- [ ] **Step 5: Add spotlight coordinates after dynamic rendering**

In `main.js`, add event delegation that detects `event.target.closest('.glass-surface')`, computes pointer coordinates from `getBoundingClientRect()`, and writes percentage values to `--pointer-x` and `--pointer-y`. Return early when `matchMedia('(pointer: coarse)').matches` or `matchMedia('(prefers-reduced-motion: reduce)').matches`. Call `initGlassSpotlight()` after `renderList()`, `renderPost()`, `renderTags()`, `renderArchive()`, and `initAbout()` have completed.

- [ ] **Step 6: Add explicit feature fallbacks**

Use `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` to switch glass surfaces/navigation to `var(--surface-strong)`. In reduced-motion mode, disable page fade, reveal transforms, spotlight opacity transitions, logo motion, card transforms, and smooth scroll.

- [ ] **Step 7: Run the visual contract and full existing tests**

Run: `node --test tests/visual-system.test.cjs tests/theme.test.cjs`

Expected: all theme and visual contract tests PASS.

Run: `npm test`

Expected: all existing and new tests PASS.

- [ ] **Step 8: Commit the visual system**

```powershell
git add -- public/assets/css/style.css public/assets/js/main.js tests/visual-system.test.cjs
git commit -m "feat(ui): apply responsive glass visual system"
```

---

### Task 4: Engineering-aware strict feed classification

**Files:**
- Modify: `scripts/fetch-feeds.js`
- Modify: `tests/feed-topic-filter.test.cjs`

**Interfaces:**
- Produces: `classifyTopic(item) -> "strict" | "relaxed" | "blocked" | "irrelevant"`
- Produces: `selectBoardItems(items, lang, now) -> strict publishable items[]`
- Preserves: finance/business terms are evaluated before all technical scoring

- [ ] **Step 1: Replace relaxed-fill expectations with strict technical contracts**

Update the classifier test to require:

```js
assert.equal(classifyTopic(item('STM32 FreeRTOS 固件开发教程', 0, 'strict')), 'strict');
assert.equal(classifyTopic(item('鸿蒙 ArkUI 组件性能优化与开发实践', 0, 'engineering')), 'strict');
assert.equal(classifyTopic(item('新型传感器发布', 0, 'generic')), 'relaxed');
assert.equal(classifyTopic(item('AI 芯片公司完成 20 亿元融资', 0, 'finance')), 'blocked');
assert.equal(classifyTopic(item('城市周末活动指南', 0, 'irrelevant')), 'irrelevant');
```

Change domestic selection to assert that generic sensor/product releases are not appended when only two strict fresh items exist. Add blocked fixtures for `财报`, `营收`, `同比增长`, `战略投资`, `IPO`, and `估值`, each containing either `AI` or `芯片`, and require all to classify as `blocked`.

- [ ] **Step 2: Run the focused feed tests and confirm RED**

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: FAIL because domestic selection currently appends relaxed entries and several expanded finance phrases are not blocked.

- [ ] **Step 3: Expand negative terms and separate engineering context**

Expand `NEGATIVE_KEYWORDS` with Chinese and English finance/market phrases including `同比`, `季度业绩`, `亏损`, `投资者`, `领投`, `战略投资`, `ipo`, `profit`, and `quarterly results`. Remove broad `鸿蒙` from unconditional core terms and add broad platforms/products to related terms.

Add `ENGINEERING_KEYWORDS` with concrete development context such as `开发`, `编程`, `源码`, `教程`, `实战`, `架构`, `协议`, `驱动`, `调试`, `性能优化`, `部署`, `组件`, `api`, `sdk`, `benchmark`, `implementation`, and `tutorial`.

Update `topicScore()` to report `{ score, hasCore, hasRelated, hasEngineering }`. Keep finance blocking first. Treat any core hit as strict; treat related technology as strict only when an engineering term also occurs; retain `relaxed` only for logging/diagnostics.

- [ ] **Step 4: Make board selection strict-only**

Remove the domestic call that appends `relaxed` candidates. Continue sorting strict candidates by recency, applying the fourteen-day window and existing link/title deduplication, and limiting the result to eight items.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/feed-topic-filter.test.cjs tests/feed-parser.test.cjs`

Expected: both suites PASS.

Run: `npm test`

Expected: full suite PASS.

- [ ] **Step 6: Commit strict classification**

```powershell
git add -- scripts/fetch-feeds.js tests/feed-topic-filter.test.cjs
git commit -m "feat(feed): require engineering context for domestic picks"
```

---

### Task 5: Revalidated previous-period domestic fallback

**Files:**
- Modify: `scripts/fetch-feeds.js`
- Modify: `tests/feed-topic-filter.test.cjs`

**Interfaces:**
- Produces: `parseGeneratedFeeds(raw) -> payload | null`
- Produces: `mergeDomesticWithPrevious(current, previous, minimum = 4) -> item[]`
- Consumes: current strict domestic selection and previous `window.FEEDS` payload
- Preserves: `assertPublishableBoards(boards)` as the final write gate

- [ ] **Step 1: Write failing pure-function fallback tests**

Import the two new functions and add tests that:

1. Parse a valid `window.FEEDS = {...};` string and return `null` for malformed input.
2. Keep two current strict items first.
3. Skip an old finance item even when its title contains `AI 芯片`.
4. Skip duplicate old links and near-duplicate titles.
5. Append revalidated old entries such as `鸿蒙 ArkUI 组件性能优化与开发实践` and `RuleGo 工业协议驱动开发实战` until exactly four items exist.
6. Preserve the old entries' original `source` and `date` fields.
7. Leave six current items unchanged rather than inserting old content.

Use this expected order for the two-current-item fixture:

```js
assert.deepEqual(merged.map((entry) => entry.title), [
  'STM32 FreeRTOS 固件开发教程',
  '边缘 AI 模型部署到 MCU',
  '鸿蒙 ArkUI 组件性能优化与开发实践',
  'RuleGo 工业协议驱动开发实战',
]);
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: FAIL because `parseGeneratedFeeds` and `mergeDomesticWithPrevious` are not exported.

- [ ] **Step 3: Implement safe previous payload parsing**

Parse only the assignment form generated by this repository. Catch file/JSON errors and return `null`; do not evaluate JavaScript. Add `readPreviousFeeds()` that reads `OUT_FILE` as UTF-8 and calls the pure parser.

- [ ] **Step 4: Implement fallback merge with current rules**

Start from a shallow copy of current items. Build accepted link and normalized-title sets from current entries. Iterate previous entries in stored order, require `classifyTopic(entry) === 'strict'`, require a safe HTTP(S) URL through `UrlPolicy.safeExternalUrl`, reject duplicate links and near-duplicate normalized titles, set `lang: 'zh'`, and stop when `minimum` is reached. Never remove or reorder current entries.

- [ ] **Step 5: Integrate fallback before the publication gate**

At the beginning of `main()`, read the previous payload before any output write. After collecting fresh boards, preserve the existing failure when no fresh selected items were fetched. Then call:

```js
const previousDomestic = previous && previous.boards && Array.isArray(previous.boards.zh)
  ? previous.boards.zh
  : [];
boards.zh = mergeDomesticWithPrevious(boards.zh, previousDomestic, MIN_DOMESTIC_ITEMS);
assertPublishableBoards(boards);
```

Log the number of previous entries added. Calculate the generated item count after merging so the completion log matches the output.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: all classification, selection, parsing, fallback, gate, and source-failure tests PASS.

Run: `npm test`

Expected: full suite PASS.

- [ ] **Step 7: Commit previous-period fallback**

```powershell
git add -- scripts/fetch-feeds.js tests/feed-topic-filter.test.cjs
git commit -m "feat(feed): backfill domestic picks from verified history"
```

---

### Task 6: Build, live feed check, and visual verification

**Files:**
- Verify: all modified source and test files
- Conditionally modify: `public/assets/js/feed-data.js`
- Conditionally modify: `public/assets/js/feed-archive.js`
- Render outside repository: `C:\Users\12618\.codex\visualizations\2026\08\10\019feab3-b025-7412-af62-316053971a32\`

**Interfaces:**
- Consumes: all prior tasks
- Produces: passing build/tests, inspected domestic output, desktop/mobile dark/light screenshots

- [ ] **Step 1: Build articles and run the complete test suite from a clean command**

Run: `npm run build`

Expected: `public/assets/js/posts-data.js` regenerates successfully.

Run: `npm test`

Expected: every test exits zero.

- [ ] **Step 2: Run the live feed fetch once**

Run: `npm run feeds`

Expected: individual source failures may be logged, but final output contains 4–8 domestic entries or the command safely fails without overwriting existing generated data.

If the command succeeds, inspect every generated domestic title/summary for financial or pure business content and verify old fallback entries retain their original date. If a missed finance phrase appears, add that phrase to the test fixture first, observe RED, expand the negative list, rerun tests, and fetch again.

- [ ] **Step 3: Start the local server without a visible helper window**

Run the server through the execution session or with PowerShell `Start-Process -WindowStyle Hidden -PassThru`, then verify `http://127.0.0.1:3000/` returns HTTP 200.

- [ ] **Step 4: Capture desktop and mobile views in both themes**

Use the installed Edge/Chrome headless binary or available browser tooling to capture:

- Desktop 1440×1100: homepage dark, homepage light, tags dark, article dark.
- Mobile 390×844: homepage dark, navigation/theme control, tags light.

Store screenshots in the visualization directory, not in the repository. Inspect image crop, readable Hero copy, header wrapping, card edges, focus/active tag states, and absence of horizontal overflow.

- [ ] **Step 5: Fix visual defects test-first where practical and rerun verification**

For markup/selector regressions, add a failing assertion to `tests/visual-system.test.cjs` before changing code. For viewport-only CSS defects, record the concrete selector and expected layout, apply the smallest CSS change, recapture the affected viewport, and rerun `npm test`.

- [ ] **Step 6: Inspect repository diff and commit generated output only when valid**

Run: `git diff --check` and `git status --short`.

If live feed files changed and passed inspection:

```powershell
git add -- public/assets/js/feed-data.js public/assets/js/feed-archive.js
git commit -m "chore(feed): refresh technical daily picks"
```

Do not commit screenshots or a failed/insufficient feed snapshot.

- [ ] **Step 7: Final completion evidence**

Record the exact successful `npm test` summary, `npm run build` result, live feed outcome, screenshot paths, and final `git status --short`. Completion requires no unintended working-tree changes.
