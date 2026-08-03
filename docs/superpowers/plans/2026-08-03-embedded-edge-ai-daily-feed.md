# Domestic Daily Feed Minimum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee four to eight domestic daily picks by expanding Chinese feed coverage and using a controlled relaxed-relevance fallback without admitting finance, corporate, or zero-technology stories.

**Architecture:** Keep the dependency-free RSS/Atom pipeline and extract classification and selection into exported pure functions. Selection always prefers strict matches; only the domestic board may add relaxed technical matches, and only until it reaches four items. Validate the final deduplicated domestic board before either generated file is written.

**Tech Stack:** Node.js 22, CommonJS, built-in `node:test`, built-in `assert`, existing RSS/Atom parser and URL policy.

## Global Constraints

- The domestic board must contain four to eight entries after freshness filtering and deduplication.
- The international board contains at most eight strict entries and may contain fewer.
- Strict matches always precede relaxed matches, even when a relaxed match is newer.
- A relaxed match must contain at least one existing related technology keyword.
- Stock prices, earnings, funding, acquisitions, valuations, layoffs, and executive changes are ineligible for both strict and relaxed selection.
- Zero-technology items are ineligible for both strict and relaxed selection.
- Preserve the existing 14-day freshness window, URL deduplication, fuzzy title deduplication, URL safety policy, and seven-day archive.
- Add IT之家 `https://www.ithome.com/rss/` and SegmentFault `https://segmentfault.com/feeds` to the domestic source list.
- Add no third-party dependency, search-engine scraping, RSSHub dependency, or external AI service.

## File Structure

- Create `tests/feed-topic-filter.test.cjs`: offline behavioral tests for classification, strict-first domestic selection, controlled fallback, international selection, and the domestic publication gate.
- Modify `scripts/fetch-feeds.js`: expand exclusion terms, classify candidates, extract board selection, add domestic feeds, and reject an undersized domestic result before writes.
- Modify `package.json`: register the new test file in the existing test command.
- Regenerate `public/assets/js/feed-data.js` and `public/assets/js/feed-archive.js` only after all offline tests pass and live fetching produces at least four domestic items.

---

### Task 1: Candidate classification and controlled domestic fallback

**Files:**
- Create: `tests/feed-topic-filter.test.cjs`
- Modify: `scripts/fetch-feeds.js:21-55, 201-313, 403-406`
- Modify: `package.json:8`

**Interfaces:**
- Consumes: parsed items shaped as `{ title, summary, link, source, date, _ts }`, `lang: 'zh' | 'en'`, and an optional millisecond timestamp.
- Produces: `classifyTopic(item): 'blocked' | 'strict' | 'relaxed' | 'irrelevant'`.
- Produces: `selectBoardItems(items, lang, now = Date.now()): Array<{ title, link, source, date, summary, lang }>`.

- [ ] **Step 1: Write failing classification and selection tests**

Create `tests/feed-topic-filter.test.cjs`:

```js
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  classifyTopic,
  selectBoardItems,
} = require('../scripts/fetch-feeds');

const NOW = Date.parse('2026-08-03T00:00:00Z');

function item(title, offset, slug, summary = '') {
  return {
    title,
    summary,
    link: `https://example.com/${slug}`,
    source: 'Fixture',
    date: '2026-08-03',
    _ts: NOW - offset,
  };
}

test('classifies strict, relaxed, blocked, and irrelevant feed items', () => {
  assert.equal(classifyTopic(item('STM32 FreeRTOS 固件开发教程', 0, 'strict')), 'strict');
  assert.equal(classifyTopic(item('新型传感器发布', 0, 'relaxed')), 'relaxed');
  assert.equal(classifyTopic(item('芯片公司完成新一轮融资', 0, 'blocked')), 'blocked');
  assert.equal(classifyTopic(item('城市周末活动指南', 0, 'irrelevant')), 'irrelevant');
});

test('domestic selection uses relaxed technical items only to reach four', () => {
  const selected = selectBoardItems([
    item('STM32 FreeRTOS 固件开发教程', 5000, 'strict-1'),
    item('边缘 AI 模型部署到 MCU', 6000, 'strict-2'),
    item('新型传感器产品应用技术方案正式发布', 1000, 'relaxed-1'),
    item('新型传感器产品应用技术方案详细介绍', 1500, 'relaxed-duplicate'),
    item('蓝牙新品发布', 2000, 'relaxed-2'),
    item('摄像头新品发布', 3000, 'relaxed-3'),
    item('芯片公司完成新一轮融资', 0, 'blocked'),
    item('城市周末活动指南', 500, 'irrelevant'),
  ], 'zh', NOW);

  assert.deepEqual(selected.map((entry) => entry.title), [
    'STM32 FreeRTOS 固件开发教程',
    '边缘 AI 模型部署到 MCU',
    '新型传感器产品应用技术方案正式发布',
    '蓝牙新品发布',
  ]);
  assert.ok(selected.every((entry) => entry.lang === 'zh'));
});

test('domestic selection does not add relaxed items when four strict items exist', () => {
  const selected = selectBoardItems([
    item('STM32 FreeRTOS 固件开发教程', 4000, 'strict-1'),
    item('TinyML 端侧推理优化', 5000, 'strict-2'),
    item('Zephyr 设备驱动实践', 6000, 'strict-3'),
    item('ESP32 物联网固件升级', 7000, 'strict-4'),
    item('新型传感器发布', 0, 'relaxed'),
  ], 'zh', NOW);

  assert.equal(selected.length, 4);
  assert.equal(selected.some((entry) => entry.title === '新型传感器发布'), false);
});

test('international selection never uses relaxed fallback', () => {
  const selected = selectBoardItems([
    item('Zephyr RTOS device driver tutorial', 1000, 'strict'),
    item('New industrial sensor announced', 0, 'relaxed'),
  ], 'en', NOW);

  assert.deepEqual(selected.map((entry) => entry.title), [
    'Zephyr RTOS device driver tutorial',
  ]);
});
```

The mutations caught are: treating one related keyword as strict, allowing blocked or zero-score padding, sorting relaxed items ahead of strict items, filling past four with relaxed items, and enabling relaxed fallback for the international board.

- [ ] **Step 2: Register and run the new test to verify RED**

Add `tests/feed-topic-filter.test.cjs` to the `node --test` file list in `package.json`.

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: FAIL because `classifyTopic` and `selectBoardItems` are not exported or defined.

- [ ] **Step 3: Implement minimal classification**

In `scripts/fetch-feeds.js`, expand `NEGATIVE_KEYWORDS` so both Chinese and English capital/corporate stories are blocked:

```js
const NEGATIVE_KEYWORDS = [
  '股票', '股市', '股价', '市值', '涨停', '跌停', '收涨', '收跌',
  '财报', '营收', '净利润', '融资', '募资', '估值', '上市',
  '收购', '并购', '裁员', '离职', '任命',
  'stock market', 'stock price', 'share price', 'market cap', 'shares rose',
  'earnings', 'revenue', 'funding round', 'venture capital', 'valuation',
  'initial public offering', 'acquires', 'acquisition', 'merger',
  'layoff', 'appoints', 'appointed', 'resigns',
];
```

Keep `topicScore(item)` as the scoring primitive and add:

```js
function classifyTopic(item) {
  const result = topicScore(item);
  if (result.score < 0) return 'blocked';
  if (result.score >= SCORE_THRESHOLD || (result.score >= 2 && result.hasCore)) {
    return 'strict';
  }
  if (result.score >= 1) return 'relaxed';
  return 'irrelevant';
}
```

- [ ] **Step 4: Extract and implement strict-first board selection**

Move link deduplication, 14-day filtering, newest-first ordering, fuzzy title deduplication, eight-item limiting, and output mapping from `collectBoard` into `selectBoardItems(items, lang, now = Date.now())`.

After freshness filtering, build strict and relaxed candidates exactly as follows:

```js
const scored = fresh.map((entry) => ({ entry, kind: classifyTopic(entry) }));
const strict = scored
  .filter((candidate) => candidate.kind === 'strict')
  .sort((a, b) => b.entry._ts - a.entry._ts);
const relaxed = scored
  .filter((candidate) => candidate.kind === 'relaxed')
  .sort((a, b) => b.entry._ts - a.entry._ts);
```

Define `MIN_DOMESTIC_ITEMS = 4`, retain `ITEMS_PER_BOARD = 8`, and remove the old score-zero fallback. Apply fuzzy title deduplication while accepting candidates:

```js
const acceptedTitles = [];
const picked = [];
function appendUnique(candidates, limit) {
  for (const { entry } of candidates) {
    const norm = normalizeTitle(entry.title);
    if (!norm || isDuplicateTitle(norm, acceptedTitles)) continue;
    acceptedTitles.push(norm);
    picked.push(entry);
    if (picked.length >= limit) break;
  }
}

appendUnique(strict, ITEMS_PER_BOARD);
if (lang === 'zh' && picked.length < MIN_DOMESTIC_ITEMS) {
  appendUnique(relaxed, MIN_DOMESTIC_ITEMS);
}
```

Iterate the complete relaxed list rather than slicing it before deduplication, because a duplicate must not prevent a later unique relaxed candidate from filling the fourth slot. Make `collectBoard` return `selectBoardItems(items, lang)` after feed requests settle. Export `classifyTopic` and `selectBoardItems` alongside `main` and `parseFeed`.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run: `node --test tests/feed-topic-filter.test.cjs tests/feed-parser.test.cjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Commit controlled fallback**

```bash
git add package.json tests/feed-topic-filter.test.cjs scripts/fetch-feeds.js
git commit -m "feat(feed): add controlled domestic fallback"
```

---

### Task 2: Expanded domestic sources and publication gate

**Files:**
- Modify: `tests/feed-topic-filter.test.cjs`
- Modify: `scripts/fetch-feeds.js:65-82, 250-313, 358-406`

**Interfaces:**
- Consumes: `boards: { en: Array, zh: Array }` after final selection and deduplication.
- Produces: `assertPublishableBoards(boards): void`, throwing when `boards.zh.length < 4`.
- Produces: `collectBoard(feeds, lang, fetcher = fetchText, now = Date.now()): Promise<Array>` so feed failures can be tested offline.

- [ ] **Step 1: Write failing publication-gate and partial-source-failure tests**

Append imports for `assertPublishableBoards` and `collectBoard`, then append:

```js
test('publication gate rejects fewer than four final domestic items', () => {
  assert.throws(
    () => assertPublishableBoards({ en: [], zh: [{}, {}, {}] }),
    /Domestic daily picks require at least 4 items; got 3/
  );
  assert.doesNotThrow(() =>
    assertPublishableBoards({ en: [], zh: [{}, {}, {}, {}] })
  );
});

test('one failed domestic source does not discard successful sources', async () => {
  const xml = `
    <rss><channel><item>
      <title>STM32 FreeRTOS 固件开发教程</title>
      <link>https://example.com/story</link>
      <pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>`;
  const fetcher = async (url) => {
    if (url.endsWith('/failed')) throw new Error('fixture failure');
    return xml;
  };

  const selected = await collectBoard([
    { name: 'Failed', url: 'https://example.com/failed' },
    { name: 'Working', url: 'https://example.com/working' },
  ], 'zh', fetcher, NOW);

  assert.deepEqual(selected.map((entry) => entry.title), [
    'STM32 FreeRTOS 固件开发教程',
  ]);
});
```

The mutations caught are: checking the board before final selection, accepting three domestic entries, requiring every source to succeed, and failing to pass the injected clock to selection.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: FAIL because `assertPublishableBoards` is undefined and `collectBoard` does not accept injected dependencies.

- [ ] **Step 3: Add verified domestic sources and injectable collection**

Append to `BOARDS.zh.feeds`:

```js
{ name: 'IT之家', url: 'https://www.ithome.com/rss/' },
{ name: 'SegmentFault', url: 'https://segmentfault.com/feeds' },
```

Change the collection signature and its two dependency uses:

```js
async function collectBoard(feeds, lang, fetcher = fetchText, now = Date.now()) {
  const results = await Promise.allSettled(
    feeds.map((feed) => fetcher(feed.url, 2).then((xml) => parseFeed(xml, feed.name)))
  );
  // preserve the existing per-source success/failure logging
  return selectBoardItems(items, lang, now);
}
```

- [ ] **Step 4: Implement and apply the publication gate before writes**

Add and export:

```js
function assertPublishableBoards(boards) {
  const domesticCount = Array.isArray(boards.zh) ? boards.zh.length : 0;
  if (domesticCount < MIN_DOMESTIC_ITEMS) {
    throw new Error(
      `Domestic daily picks require at least ${MIN_DOMESTIC_ITEMS} items; got ${domesticCount}. Existing generated data was preserved.`
    );
  }
}
```

In `main()`, call `assertPublishableBoards(boards)` after both boards are fully collected and before constructing the payload, calling `fs.mkdirSync`, calling either `fs.writeFileSync`, or calling `updateArchive`. Retain the existing all-empty check if it gives a more specific error, but the domestic gate must run before any write.

- [ ] **Step 5: Run focused and full tests to verify GREEN**

Run: `node --test tests/feed-topic-filter.test.cjs tests/feed-parser.test.cjs`

Expected: all tests PASS with zero failures.

Run: `npm test`

Expected: all configured test commands exit 0 with no failures.

- [ ] **Step 6: Commit expanded coverage and gate**

```bash
git add tests/feed-topic-filter.test.cjs scripts/fetch-feeds.js
git commit -m "feat(feed): require four domestic daily picks"
```

---

### Task 3: Live-feed verification and generated data

**Files:**
- Modify when live fetching succeeds: `public/assets/js/feed-data.js`
- Modify when live fetching succeeds: `public/assets/js/feed-archive.js`
- Reference: `docs/superpowers/specs/2026-08-03-embedded-edge-ai-daily-feed-design.md`

**Interfaces:**
- Consumes: the completed `npm run feeds` command and generated `window.FEEDS` payload.
- Produces: current daily and archive data whose domestic board contains four to eight non-blocked, non-irrelevant entries.

- [ ] **Step 1: Run a live fetch**

Run: `npm run feeds`

Expected: IT之家 and SegmentFault are attempted, at least one source succeeds, the domestic board finishes with four to eight items, and the command exits 0. If external feeds are temporarily unavailable and the domestic board remains below four, confirm the command exits nonzero and the two generated files remain unchanged.

- [ ] **Step 2: Audit generated current data with production classification**

Run:

```powershell
@'
const fs = require('node:fs');
const vm = require('node:vm');
const { classifyTopic, assertPublishableBoards } = require('./scripts/fetch-feeds');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('public/assets/js/feed-data.js', 'utf8'), sandbox);
const boards = sandbox.window.FEEDS.boards;
assertPublishableBoards(boards);
const invalid = Object.values(boards)
  .flat()
  .filter((entry) => ['blocked', 'irrelevant'].includes(classifyTopic(entry)));
if (invalid.length) {
  console.error(invalid.map((entry) => entry.title));
  process.exit(1);
}
console.log(`Audited ${boards.zh.length} domestic items; no blocked or irrelevant item was emitted.`);
'@ | node -
```

Expected: exit 0, domestic count is between four and eight, and no blocked or irrelevant item is printed.

- [ ] **Step 3: Run fresh completion verification**

Run: `npm test`

Expected: all configured tests exit 0 with no failures.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 4: Commit regenerated feed data if it changed**

```bash
git add public/assets/js/feed-data.js public/assets/js/feed-archive.js
git diff --cached --quiet || git commit -m "chore(feed): refresh domestic daily picks"
```

- [ ] **Step 5: Review final scope**

Run: `git status --short` and `git log -6 --oneline`.

Expected: no unintended files are modified; commits cover the approved design, controlled domestic fallback, expanded source coverage, the four-item publication gate, and any regenerated feed data.
