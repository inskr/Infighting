# Embedded and Edge AI Daily Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily feed admit embedded-system and edge-AI technical content while rejecting stock, finance, acquisition, funding, and other non-technical corporate news.

**Architecture:** Keep the existing dependency-free RSS/Atom pipeline, but split topic admission and post-fetch selection into exported pure functions. Apply the topic gate before sorting and limiting, and remove the unrelated-content fallback so an undersized board remains undersized.

**Tech Stack:** Node.js 22, CommonJS, built-in `node:test`, built-in `assert`, existing RSS/Atom parser and URL policy.

## Global Constraints

- Each language board contains at most eight entries and may contain fewer.
- Technical tutorials, analysis, embedded/edge-AI product releases, and technical industry updates are eligible.
- Stock prices, earnings, funding, acquisitions, valuations, layoffs, and executive changes are ineligible even when an article mentions an embedded or edge-AI company.
- Preserve the existing 14-day freshness window, URL deduplication, fuzzy title deduplication, URL safety policy, and seven-day archive.
- Add no third-party dependency and no external AI service.

## File Structure

- Create `tests/feed-topic-filter.test.cjs`: focused offline behavioral tests for topic admission and board selection.
- Modify `scripts/fetch-feeds.js`: expand exclusion vocabulary, expose pure topic/selection functions, and remove unrelated fallback behavior.
- Modify `package.json`: include the new test file in the existing `npm test` command.
- Regenerate `public/assets/js/feed-data.js` and `public/assets/js/feed-archive.js` only during the final live-feed verification.

---

### Task 1: Strict topic admission

**Files:**
- Create: `tests/feed-topic-filter.test.cjs`
- Modify: `scripts/fetch-feeds.js:21-55, 201-221, 403-406`
- Modify: `package.json:8`

**Interfaces:**
- Consumes: feed item objects shaped as `{ title: string, summary?: string }`.
- Produces: `isTopicRelevant(item): boolean`, exported from `scripts/fetch-feeds.js`.

- [ ] **Step 1: Write failing admission tests**

Create `tests/feed-topic-filter.test.cjs` with direct behavioral examples:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isTopicRelevant } = require('../scripts/fetch-feeds');

test('admits embedded and edge AI engineering content', () => {
  const accepted = [
    { title: 'Building a low-power STM32 FreeRTOS sensor node' },
    { title: 'Deploying quantized TinyML inference on an MCU' },
    { title: 'New Jetson edge AI developer kit adds an NPU' },
  ];

  for (const item of accepted) assert.equal(isTopicRelevant(item), true, item.title);
});

test('rejects capital and corporate news even when it mentions edge AI', () => {
  const rejected = [
    { title: 'Microchip acquires edge AI startup Hailo' },
    { title: '芯片公司完成新一轮融资，估值达到百亿元' },
    { title: 'MCU vendor reports quarterly earnings and revenue growth' },
    { title: 'Embedded systems company appoints a new chief executive' },
  ];

  for (const item of rejected) assert.equal(isTopicRelevant(item), false, item.title);
});

test('rejects generic technology news without enough domain relevance', () => {
  assert.equal(
    isTopicRelevant({ title: 'Cloud platform launches a new developer dashboard' }),
    false
  );
});
```

- [ ] **Step 2: Register and run the test to verify RED**

Add `tests/feed-topic-filter.test.cjs` to the `node --test` file list in the `test` script in `package.json`.

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: FAIL because `isTopicRelevant` is not exported or defined.

- [ ] **Step 3: Implement minimal strict admission**

In `scripts/fetch-feeds.js`, expand `NEGATIVE_KEYWORDS` with exact Chinese and English capital/corporate phrases, including:

```js
const NEGATIVE_KEYWORDS = [
  '股票', '股市', '股价', '市值', '涨停', '跌停', '收涨', '收跌',
  '财报', '营收', '净利润', '融资', '募资', '估值', '上市',
  '收购', '并购', '裁员', '离职', '任命',
  'stock market', 'stock price', 'share price', 'market cap', 'shares rose',
  'earnings', 'revenue', 'funding round', 'venture capital', 'valuation',
  'initial public offering',
  'acquires', 'acquisition', 'merger', 'layoff', 'appoints', 'appointed', 'resigns',
];
```

Keep `topicScore(item)` as the scoring primitive and add:

```js
function isTopicRelevant(item) {
  const result = topicScore(item);
  return result.score >= SCORE_THRESHOLD || (result.score >= 2 && result.hasCore);
}
```

Export `isTopicRelevant` alongside `main` and `parseFeed`.

- [ ] **Step 4: Run focused and existing feed tests to verify GREEN**

Run: `node --test tests/feed-topic-filter.test.cjs tests/feed-parser.test.cjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 5: Commit strict admission**

```bash
git add package.json tests/feed-topic-filter.test.cjs scripts/fetch-feeds.js
git commit -m "fix(feed): reject finance and corporate news"
```

---

### Task 2: Remove unrelated-content fallback

**Files:**
- Modify: `tests/feed-topic-filter.test.cjs`
- Modify: `scripts/fetch-feeds.js:15-18, 250-313, 403-406`

**Interfaces:**
- Consumes: parsed feed item objects shaped as `{ title, summary, link, source, date, _ts }`, a language string, and an optional current timestamp.
- Produces: `selectBoardItems(items, lang, now = Date.now()): Array<{ title, link, source, date, summary, lang }>`.
- Uses: `isTopicRelevant(item): boolean` from Task 1.

- [ ] **Step 1: Write a failing no-padding test**

Append to `tests/feed-topic-filter.test.cjs` and import `selectBoardItems`:

```js
test('does not pad a board with unrelated items when few technical items qualify', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'Zephyr RTOS adds a new STM32 device driver',
      summary: '',
      link: 'https://example.com/zephyr-driver',
      source: 'Fixture',
      date: '2026-08-03',
      _ts: now,
    },
    {
      title: 'Markets rally after company results',
      summary: 'Stocks rise across major indexes',
      link: 'https://example.com/markets',
      source: 'Fixture',
      date: '2026-08-03',
      _ts: now - 1000,
    },
  ];

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'Zephyr RTOS adds a new STM32 device driver',
  ]);
  assert.equal(selected[0].lang, 'en');
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: FAIL because `selectBoardItems` is not exported or defined.

- [ ] **Step 3: Extract selection and delete fallback behavior**

Move the post-fetch logic from `collectBoard` into `selectBoardItems(items, lang, now = Date.now())`. Preserve link deduplication, the 14-day filter, newest-first ordering, fuzzy title deduplication, eight-item limit, and output mapping.

The candidate pool must be only:

```js
const pool = fresh
  .filter(isTopicRelevant)
  .sort((a, b) => b._ts - a._ts);
```

Delete `MIN_ITEMS_AFTER_FILTER`, the `allScored`/`qualified` fallback branch, and every path that admits a score-zero item. Make `collectBoard` delegate after all feeds settle:

```js
return selectBoardItems(items, lang);
```

Export `selectBoardItems` for offline testing.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node --test tests/feed-topic-filter.test.cjs tests/feed-parser.test.cjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: all configured test commands exit 0 with no failures.

- [ ] **Step 6: Commit no-padding selection**

```bash
git add tests/feed-topic-filter.test.cjs scripts/fetch-feeds.js
git commit -m "fix(feed): require technical relevance for daily picks"
```

---

### Task 3: Live-feed verification and generated data

**Files:**
- Modify when live fetching succeeds: `public/assets/js/feed-data.js`
- Modify when live fetching succeeds: `public/assets/js/feed-archive.js`
- Reference: `docs/superpowers/specs/2026-08-03-embedded-edge-ai-daily-feed-design.md`

**Interfaces:**
- Consumes: the completed `npm run feeds` command and generated `window.FEEDS` payload.
- Produces: freshly generated daily and archive data containing only entries accepted by `isTopicRelevant`.

- [ ] **Step 1: Run a live fetch**

Run: `npm run feeds`

Expected: at least one source succeeds; the script reports the before/after topic-filter count for each language board and exits 0. If external feeds are unavailable, record the failure and rely on the offline tests without claiming live verification.

- [ ] **Step 2: Audit every generated current item with the production classifier**

Run:

```powershell
@'
const fs = require('node:fs');
const vm = require('node:vm');
const { isTopicRelevant } = require('./scripts/fetch-feeds');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('public/assets/js/feed-data.js', 'utf8'), sandbox);
const items = Object.values(sandbox.window.FEEDS.boards).flat();
const rejected = items.filter((item) => !isTopicRelevant(item));
if (rejected.length) {
  console.error(rejected.map((item) => item.title));
  process.exit(1);
}
console.log(`Audited ${items.length} generated items; all are topic-relevant.`);
'@ | node -
```

Expected: exit 0 and `all are topic-relevant`.

- [ ] **Step 3: Run fresh completion verification**

Run: `npm test`

Expected: all configured tests exit 0 with no failures after generation.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 4: Commit regenerated feed data if it changed**

```bash
git add public/assets/js/feed-data.js public/assets/js/feed-archive.js
git diff --cached --quiet || git commit -m "chore(feed): refresh embedded edge AI picks"
```

- [ ] **Step 5: Review final scope**

Run: `git status --short` and `git log -4 --oneline`.

Expected: no unintended files are modified; commits cover the design, strict topic gate, no-padding selector, and any regenerated feed data.
