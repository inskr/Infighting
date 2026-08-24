'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const modulePath = path.join(__dirname, '..', 'public', 'assets', 'js', 'search-core.js');
let SearchCore;
try {
  SearchCore = require(modulePath);
} catch (error) {
  SearchCore = { loadError: error };
}

function api() {
  assert.equal(SearchCore.loadError, undefined, 'search core module should load');
  return SearchCore;
}

const documents = [
  {
    id: 'body-later',
    title: 'General notes',
    summary: 'Peripheral setup',
    tags: ['firmware'],
    date: '2026-08-12',
    body: 'Use init_hw() before enabling the interface.',
  },
  {
    id: 'title-earlier',
    title: 'INIT_HW setup',
    summary: 'General notes',
    tags: ['firmware'],
    date: '2026-08-11',
    body: 'A title match should rank first.',
  },
  {
    id: 'tag-match',
    title: 'General notes',
    summary: 'General notes',
    tags: ['INIT_HW'],
    date: '2026-08-10',
    body: 'A tag match has second priority.',
  },
  {
    id: 'summary-match',
    title: 'General notes',
    summary: 'Run init_hw before boot.',
    tags: ['firmware'],
    date: '2026-08-09',
    body: 'A summary match has third priority.',
  },
];

test('normalizes Unicode, case, and query whitespace without splitting Chinese text', () => {
  const query = api().normalizeQuery('  ＩＮＩＴ＿ＨＷ   雷达 信号  ');

  assert.deepEqual(query, {
    phrase: 'init_hw 雷达 信号',
    terms: ['init_hw', '雷达', '信号'],
  });
});

test('finds Chinese continuous text and ASCII identifiers case-insensitively', () => {
  const results = api().search(
    [
      {
        id: 'radar',
        title: '雷达信号处理',
        summary: '',
        tags: ['DSP'],
        date: '2026-08-12',
        body: '调用 Init_HW() 完成采集。',
      },
    ],
    '雷达信号 INIT_HW'
  );

  assert.equal(results.length, 1);
  assert.equal(results[0].document.id, 'radar');
  assert.equal(results[0].score, 17);
});

test('uses title, tags, summary, then body priority when all documents match once', () => {
  const results = api().search(documents, 'init_hw');

  assert.deepEqual(
    results.map((result) => result.document.id),
    ['title-earlier', 'tag-match', 'summary-match', 'body-later']
  );
  assert.deepEqual(
    results.map((result) => result.score),
    [28, 22, 17, 13]
  );
});

test('adds the exact phrase boost once per matching field', () => {
  const results = api().search(
    [
      {
        id: 'phrase',
        title: 'Start init hw now',
        summary: 'init hw init hw',
        tags: ['boot'],
        date: '2026-08-12',
        body: 'init hw procedure',
      },
    ],
    'init hw'
  );

  assert.equal(results[0].score, 80);
});

test('breaks equal scores by descending date and then ascending id', () => {
  const results = api().search(
    [
      { id: 'zeta', title: 'Match', summary: '', tags: [], date: '2026-08-10', body: '' },
      { id: 'alpha', title: 'Match', summary: '', tags: [], date: '2026-08-10', body: '' },
      { id: 'middle', title: 'Match', summary: '', tags: [], date: '2026-08-11', body: '' },
    ],
    'match'
  );

  assert.deepEqual(results.map((result) => result.document.id), ['middle', 'alpha', 'zeta']);
});

test('returns no results for an empty normalized query', () => {
  assert.deepEqual(api().search(documents, '  \u3000  '), []);
});

test('does not mutate source documents or their tag arrays', () => {
  const source = [
    { id: 'immutable', title: 'Match', summary: '', tags: ['match'], date: '2026-08-12', body: 'match' },
  ];
  const snapshot = structuredClone(source);

  api().search(source, 'match');

  assert.deepEqual(source, snapshot);
  assert.notEqual(api().search(source, 'match')[0].document, source[0]);
  assert.notEqual(api().search(source, 'match')[0].document.tags, source[0].tags);
});

test('creates bounded, whitespace-normalized snippets with ellipses only for removed text', () => {
  const core = api();
  const body = '  Prefix\n\ncontains    NEEDLE and a long suffix.  ';

  assert.equal(core.createSnippet(body, [{ start: 16, end: 22 }], 8), '…ains NEEDLE and…');
  assert.equal(core.createSnippet('  NEEDLE\ntext  ', [{ start: 2, end: 8 }], 20), 'NEEDLE text');
});

test('caps visible snippet text even when the earliest match exceeds the radius window', () => {
  const snippet = api().createSnippet('ABCDEFGHIJK', [{ start: 0, end: 11 }], 3);

  assert.equal(snippet, 'ABCDEF…');
  assert.equal(snippet.replaceAll('…', '').length, 6);
});

test('clips long-match highlight ranges to the bounded search snippet', () => {
  const term = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const [result] = api().search(
    [
      {
        id: 'long-range',
        title: 'Fixture',
        summary: '',
        tags: [],
        date: '2026-08-12',
        body: `prefix ${term} suffix`,
      },
    ],
    term
  );

  assert.equal(result.snippet, `…${term.slice(0, 32)}…`);
  assert.deepEqual(result.ranges, [{ start: 1, end: 33 }]);
  assert.equal(result.snippet.slice(1, 33), term.slice(0, 32));
  assert.equal(result.snippet.replaceAll('…', '').length, 32);
});

test('returns snippet ranges relative to the safe bounded snippet', () => {
  const [result] = api().search(
    [
      {
        id: 'snippet',
        title: 'Fixture',
        summary: '',
        tags: [],
        date: '2026-08-12',
        body: 'Before content has init_hw and then more content after it.',
      },
    ],
    'init_hw'
  );

  assert.equal(result.snippet, '…content has init_hw and then mo…');
  assert.deepEqual(result.ranges, [{ start: 13, end: 20 }]);
  assert.equal(result.snippet.length <= 2 * 16 + 2, true);
});

test('maps body ranges back to display text after Unicode lowercase expansion', () => {
  const [result] = api().search(
    [
      {
        id: 'unicode-range',
        title: 'Fixture',
        summary: '',
        tags: [],
        date: '2026-08-12',
        body: 'prefix İx marker suffix',
      },
    ],
    'MARKER'
  );

  assert.equal(result.snippet, 'prefix İx marker suffix');
  assert.deepEqual(result.ranges, [{ start: 10, end: 16 }]);
  assert.equal(result.snippet.slice(result.ranges[0].start, result.ranges[0].end), 'marker');
});

test('is provided as a UMD browser global as well as CommonJS', () => {
  const source = fs.readFileSync(modulePath, 'utf8');
  const context = { globalThis: {} };
  require('node:vm').runInNewContext(source, context);

  assert.equal(typeof context.globalThis.SearchCore.search, 'function');
});
