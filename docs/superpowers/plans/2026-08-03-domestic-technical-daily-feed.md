# Domestic Technical Daily Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the domestic daily board contain only embedded/edge-AI tutorials, source analysis, and reproducible engineering practice while leaving the international board's admission policy unchanged.

**Architecture:** Keep `isTopicRelevant` as the shared embedded/edge-AI domain gate, then add a pure `isDomesticTechnicalContent` gate for learning intent and engineering evidence. Route current-board selection and archive sanitation through a language-aware predicate so only the `zh` board receives the stricter policy.

**Tech Stack:** Node.js CommonJS, built-in `node:test`, built-in `assert`, existing dependency-free RSS/Atom crawler.

## Global Constraints

- Domestic content must first satisfy the existing embedded/edge-AI topic filter.
- Domestic content must be a tutorial, source analysis, or reproducible engineering practice.
- Version announcements, product introductions, company news, market events, industry reports, policy news, and general commentary are ineligible for the domestic board.
- A mixed release/practice article is eligible only when its title contains a practice signal and its summary contains concrete engineering evidence.
- The international board must keep the existing topic policy.
- An undersized domestic board remains undersized; no fallback padding is allowed.
- Preserve the 14-day freshness window, URL deduplication, fuzzy-title deduplication, newest-first order, eight-item cap, seven-day archive, and caller-owned input arrays.
- Add no dependency and no external AI service.

## File Structure

- Modify `scripts/fetch-feeds.js`: define domestic learning, engineering, and news signals; export the pure domestic predicate; select predicates by board language; sanitize archives with the same language-aware policy.
- Modify `tests/feed-topic-filter.test.cjs`: add classification, board-selection, archive-cleaning, and international-regression tests against real exported functions.
- Regenerate `public/assets/js/feed-data.js`: replace the current domestic release announcement with qualifying practice content, or leave the board empty if none qualifies.
- Regenerate `public/assets/js/feed-archive.js`: remove historical domestic entries that fail the new predicate.

---

### Task 1: Domestic tutorial and engineering classifier

**Files:**
- Modify: `tests/feed-topic-filter.test.cjs`
- Modify: `scripts/fetch-feeds.js`

**Interfaces:**
- Consumes: `{ title?: string, summary?: string }` feed items.
- Uses: `isTopicRelevant(item): boolean`.
- Produces: `isDomesticTechnicalContent(item): boolean`, exported from `scripts/fetch-feeds.js`.

- [ ] **Step 1: Write failing domestic admission tests**

Extend the test import with `isDomesticTechnicalContent`, then add literal fixtures:

```js
test('domestic admission keeps tutorials source analysis and engineering practice', () => {
  const accepted = [
    { title: 'STM32 FreeRTOS 任务调度教程：从创建任务到优先级配置' },
    { title: 'ESP32 Wi-Fi 驱动源码解析与事件循环实现' },
    { title: '边缘 AI 模型在 Jetson 上的量化部署实战' },
    { title: '基于 Zephyr 的传感器驱动移植与调试踩坑记录' },
  ];

  for (const item of accepted) {
    assert.equal(isDomesticTechnicalContent(item), true, item.title);
  }
});

test('domestic admission rejects releases products and industry news', () => {
  const rejected = [
    { title: 'RuleGo v0.37.0 发布：全面支持工业协议与边缘计算' },
    { title: '新款 STM32 边缘 AI 开发板正式上市' },
    { title: '国产 MCU 厂商亮相嵌入式技术峰会' },
    { title: '2026 边缘计算产业趋势报告发布' },
    { title: '多地出台物联网产业扶持政策' },
  ];

  for (const item of rejected) {
    assert.equal(isDomesticTechnicalContent(item), false, item.title);
  }
});

test('domestic mixed release content requires title intent and summary evidence', () => {
  const cases = [
    {
      title: 'Zephyr 4.0 发布后的 STM32 驱动迁移实战',
      summary: '本文给出设备树修改、编译配置、烧录步骤和调试结果。',
      want: true,
    },
    {
      title: 'Zephyr 4.0 正式发布，新增 STM32 驱动支持',
      summary: '新版本改进了嵌入式设备支持。',
      want: false,
    },
    {
      title: 'Zephyr 4.0 正式发布，新增 STM32 驱动支持',
      summary: '附设备树修改、编译配置和烧录步骤。',
      want: false,
    },
  ];

  for (const { want, ...item } of cases) {
    assert.equal(isDomesticTechnicalContent(item), want, item.title);
  }
});
```

Production mutation caught: removing the domestic gate would admit all three rejected content classes; checking only the summary would incorrectly admit the third mixed-release fixture.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-name-pattern="domestic admission|domestic mixed" tests/feed-topic-filter.test.cjs`

Expected: FAIL because `isDomesticTechnicalContent` is not exported/defined.

- [ ] **Step 3: Implement the minimal pure predicate**

Add deterministic signal lists near the existing topic constants:

```js
const DOMESTIC_PRACTICE_SIGNALS = [
  '教程', '指南', '实战', '实践', '源码', '解析', '原理', '入门', '进阶',
  '从零', '实现', '开发', '移植', '部署', '调试', '优化', '测试', '排障',
  '踩坑', '配置', '构建', '复盘', 'tutorial', 'guide', 'walkthrough',
  'hands-on', 'source code', 'deep dive', 'porting', 'deployment', 'debugging',
];
const DOMESTIC_ENGINEERING_EVIDENCE = [
  '代码', '步骤', '设备树', '驱动', '编译', '烧录', '配置', '接口', '协议',
  '日志', '测试', '调试', '迁移', '部署', '实现', '源码', 'code', 'build',
  'flash', 'driver', 'configuration', 'benchmark', 'debug', 'deploy',
];
const DOMESTIC_NEWS_SIGNALS = [
  '发布', '推出', '亮相', '新品', '正式上线', '上市', '峰会', '展会',
  '行业报告', '产业报告', '趋势报告', '白皮书', '政策', '市场活动',
  '产业动态', '重大突破', '成功研制', '首次', '获奖',
  'release', 'launch', 'announces', 'announcement', 'report', 'white paper',
];
```

Add a helper that reuses `includesKeyword` for ASCII boundaries and Chinese substring matching:

```js
function includesAnySignal(text, signals) {
  return signals.some((signal) => includesKeyword(text, signal));
}
```

Add the predicate:

```js
function isDomesticTechnicalContent(item) {
  if (!isTopicRelevant(item)) return false;

  const title = (item.title || '').toLowerCase();
  const summary = (item.summary || '').toLowerCase();
  const text = title + ' ' + summary;
  const titleHasPractice = includesAnySignal(title, DOMESTIC_PRACTICE_SIGNALS);
  const hasPractice = titleHasPractice || includesAnySignal(summary, DOMESTIC_PRACTICE_SIGNALS);
  if (!hasPractice) return false;

  const hasNewsSignal = includesAnySignal(text, DOMESTIC_NEWS_SIGNALS);
  if (!hasNewsSignal) return true;

  return titleHasPractice && includesAnySignal(summary, DOMESTIC_ENGINEERING_EVIDENCE);
}
```

Export `isDomesticTechnicalContent` alongside `isTopicRelevant`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --test --test-name-pattern="domestic admission|domestic mixed" tests/feed-topic-filter.test.cjs`

Expected: 3 PASS, 0 FAIL.

- [ ] **Step 5: Run all feed filter tests**

Run: `node --test tests/feed-topic-filter.test.cjs`

Expected: all tests PASS; existing `isTopicRelevant` behavior is unchanged.

- [ ] **Step 6: Commit the classifier**

```powershell
git add -- scripts/fetch-feeds.js tests/feed-topic-filter.test.cjs
git commit -m "fix(feed): require domestic engineering content"
```

---

### Task 2: Apply the domestic policy to current and archived boards

**Files:**
- Modify: `tests/feed-topic-filter.test.cjs`
- Modify: `scripts/fetch-feeds.js`

**Interfaces:**
- Consumes: `isDomesticTechnicalContent(item)` from Task 1, board language keys `zh` and `en`, current items, and archived boards.
- Produces: `isBoardItemRelevant(item, lang): boolean` as an internal helper.
- Preserves: `selectBoardItems(items, lang, now)` and `mergeArchive(archive, boards, updatedAt)` public signatures.

- [ ] **Step 1: Write failing language-routing tests**

Add tests that observe real selector output rather than helper internals:

```js
test('domestic selection does not pad with related release announcements', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'STM32 FreeRTOS 低功耗配置实战',
      summary: '包含代码、编译配置和功耗测试结果。',
      link: 'https://example.com/practice', source: 'Fixture',
      date: '2026-08-03', _ts: now,
    },
    {
      title: 'RuleGo v0.37.0 发布：工业协议与边缘计算全面升级',
      summary: '新版本今日正式发布。',
      link: 'https://example.com/release', source: 'Fixture',
      date: '2026-08-03', _ts: now - 1000,
    },
  ];

  assert.deepEqual(
    selectBoardItems(items, 'zh', now).map((item) => item.title),
    ['STM32 FreeRTOS 低功耗配置实战']
  );
});

test('international selection keeps the existing product-release policy', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const item = {
    title: 'New Jetson edge AI developer kit adds an NPU',
    summary: '', link: 'https://example.com/jetson', source: 'Fixture',
    date: '2026-08-03', _ts: now,
  };

  assert.deepEqual(
    selectBoardItems([item], 'en', now).map((entry) => entry.title),
    [item.title]
  );
});
```

Production mutation caught: applying `isTopicRelevant` to every language would admit the domestic release; applying the stricter predicate to every language would remove the international release.

- [ ] **Step 2: Run selector tests and verify RED**

Run: `node --test --test-name-pattern="domestic selection|international selection" tests/feed-topic-filter.test.cjs`

Expected: domestic selection test FAILS because the release announcement is still returned; international test PASSES.

- [ ] **Step 3: Route current-board selection by language**

Add:

```js
function isBoardItemRelevant(item, lang) {
  return lang === 'zh'
    ? isDomesticTechnicalContent(item)
    : isTopicRelevant(item);
}
```

Change the candidate pool in `selectBoardItems` to:

```js
const pool = fresh
  .filter((item) => isBoardItemRelevant(item, lang))
  .sort((a, b) => b._ts - a._ts);
```

- [ ] **Step 4: Run selector tests and verify GREEN**

Run: `node --test --test-name-pattern="domestic selection|international selection" tests/feed-topic-filter.test.cjs`

Expected: 2 PASS, 0 FAIL.

- [ ] **Step 5: Write a failing archive-sanitation test**

Add a focused archive fixture:

```js
test('archive merge removes domestic news but preserves international releases', () => {
  const domesticPractice = {
    title: 'ESP32 驱动源码解析与调试实战', link: 'https://example.com/zh-practice',
    source: 'Fixture', date: '2026-08-02', summary: '包含代码和调试步骤。', lang: 'zh',
  };
  const domesticRelease = {
    title: 'ESP32 新款边缘 AI 开发板正式发布', link: 'https://example.com/zh-release',
    source: 'Fixture', date: '2026-08-02', summary: '新品正式亮相。', lang: 'zh',
  };
  const internationalRelease = {
    title: 'New Jetson edge AI developer kit adds an NPU', link: 'https://example.com/en-release',
    source: 'Fixture', date: '2026-08-02', summary: '', lang: 'en',
  };
  const archive = { days: [{
    date: '2026-08-02',
    boards: { zh: [domesticPractice, domesticRelease], en: [internationalRelease] },
  }] };

  const merged = mergeArchive(archive, { zh: [], en: [] }, '2026-08-03T12:00:00.000Z');
  const previous = merged.days.find((day) => day.date === '2026-08-02');

  assert.deepEqual(previous.boards.zh.map((item) => item.title), [domesticPractice.title]);
  assert.deepEqual(previous.boards.en.map((item) => item.title), [internationalRelease.title]);
});
```

Production mutation caught: using the shared predicate inside `sanitizeArchiveBoards` would retain `domesticRelease`.

- [ ] **Step 6: Run the archive test and verify RED**

Run: `node --test --test-name-pattern="archive merge removes domestic" tests/feed-topic-filter.test.cjs`

Expected: FAIL because the archived domestic release is retained.

- [ ] **Step 7: Route archive sanitation by board key**

Replace the archive filter with:

```js
function sanitizeArchiveBoards(boards) {
  return Object.fromEntries(
    Object.entries(boards || {}).map(([key, items]) => [
      key,
      Array.isArray(items)
        ? items.filter((item) => isBoardItemRelevant(item, key))
        : [],
    ])
  );
}
```

- [ ] **Step 8: Run all feed tests and commit integration**

Run: `node --test tests/feed-topic-filter.test.cjs tests/feed-parser.test.cjs`

Expected: all tests PASS with zero failures.

```powershell
git add -- scripts/fetch-feeds.js tests/feed-topic-filter.test.cjs
git commit -m "fix(feed): filter domestic board to tutorials"
```

---

### Task 3: Regenerate feeds and verify the final policy

**Files:**
- Modify when generation succeeds: `public/assets/js/feed-data.js`
- Modify when generation succeeds: `public/assets/js/feed-archive.js`

**Interfaces:**
- Consumes: live configured RSS/Atom sources and the completed language-aware classifiers.
- Produces: current and archived feed payloads where every `zh` item passes `isDomesticTechnicalContent` and every `en` item passes `isTopicRelevant`.

- [ ] **Step 1: Run the full offline suite before generation**

Run: `npm test`

Expected: every configured test command exits 0 with no failures.

- [ ] **Step 2: Run live feed generation**

Run: `npm run feeds`

Expected: at least one source succeeds and the command exits 0. Individual RSS sources may fail without invalidating the run. If the command cannot generate any feed items, preserve existing generated files and report the external failure without claiming live verification.

- [ ] **Step 3: Audit current and archived payloads with production predicates**

Run:

```powershell
@'
const fs = require('node:fs');
const vm = require('node:vm');
const { isTopicRelevant, isDomesticTechnicalContent } = require('./scripts/fetch-feeds');
const sandbox = { window: {} };
for (const file of ['public/assets/js/feed-data.js', 'public/assets/js/feed-archive.js']) {
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
}
const current = sandbox.window.FEEDS.boards;
const archived = sandbox.window.FEED_ARCHIVE.days.flatMap((day) =>
  Object.entries(day.boards).flatMap(([lang, items]) => items.map((item) => ({ lang, item })))
);
const entries = [
  ...Object.entries(current).flatMap(([lang, items]) => items.map((item) => ({ lang, item }))),
  ...archived,
];
const rejected = entries.filter(({ lang, item }) =>
  lang === 'zh' ? !isDomesticTechnicalContent(item) : !isTopicRelevant(item)
);
if (rejected.length) {
  console.error(rejected.map(({ lang, item }) => `${lang}: ${item.title}`).join('\n'));
  process.exit(1);
}
console.log(`Audited ${entries.length} current/archive entries; rejected=0`);
'@ | node -
```

Expected: exit 0 with `rejected=0`. A zero-length domestic board is valid.

- [ ] **Step 4: Run completion checks**

Run: `npm test`

Expected: all configured tests PASS after regeneration.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

Run: `git status --short`

Expected: only generated feed data is modified after the two implementation commits.

- [ ] **Step 5: Commit generated data if changed**

```powershell
git add -- public/assets/js/feed-data.js public/assets/js/feed-archive.js
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m "chore(feed): refresh domestic technical picks" }
```

- [ ] **Step 6: Push and confirm PR state**

Run: `git push origin codex/embedded-edge-ai-feed`

Expected: push succeeds and updates pull request #2.

Run: `& 'C:\Program Files\GitHub CLI\gh.exe' pr view 2 --json url,headRefName,mergeable,mergeStateStatus,statusCheckRollup`

Expected: PR URL is `https://github.com/inskr/Infighting/pull/2`, head is `codex/embedded-edge-ai-feed`, and no new merge conflict is reported.
