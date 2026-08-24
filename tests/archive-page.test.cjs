'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const UrlPolicy = require('../public/assets/js/url-policy.js');

const modulePath = path.join(__dirname, '..', 'public', 'assets', 'js', 'archive-page.js');
let ArchivePage;
try {
  ArchivePage = require(modulePath);
} catch (error) {
  ArchivePage = { loadError: error };
}

function api() {
  assert.equal(ArchivePage.loadError, undefined, 'archive page module should load');
  return ArchivePage;
}

function fixture(overrides = {}) {
  const days = { innerHTML: '' };
  const updated = { textContent: '' };
  const elements = new Map([
    ['archive-days', days],
    ['archive-updated', updated],
  ]);
  const shellCalls = [];
  const root = {
    document: { getElementById(id) { return elements.get(id) || null; } },
    FEEDS: overrides.feeds,
    FEED_ARCHIVE: overrides.archive,
    UrlPolicy: overrides.urlPolicy,
    SiteShell: overrides.siteShell || {
      init(target, activeNav) { shellCalls.push({ target, activeNav }); },
    },
  };
  return { days, root, shellCalls, updated };
}

test('renders archive days newest first while excluding the date published on home', () => {
  // Break caught: today is duplicated in the archive or stale days appear before newer ones.
  const view = fixture({
    feeds: { updatedAt: '2026-08-24T08:00:00.000Z' },
    archive: {
      updatedAt: '2026-08-24T09:30:00.000Z',
      days: [
        { date: '2026-08-22', boards: { en: [], zh: [] } },
        { date: '2026-08-24', boards: { en: [], zh: [] } },
        { date: '2026-08-23', boards: { en: [], zh: [] } },
      ],
    },
  });

  api().init(view.root);

  assert.ok(view.days.innerHTML.indexOf('2026-08-23') < view.days.innerHTML.indexOf('2026-08-22'));
  assert.doesNotMatch(view.days.innerHTML, /2026-08-24/);
  assert.match(view.days.innerHTML, /当日未获取到内容。/);
  assert.equal(view.updated.textContent, '更新于 2026-08-24');
  assert.deepEqual(view.shellCalls, [{ target: view.root, activeNav: 'archive' }]);
});

test('renders archive day and board headings directly below the page heading', () => {
  // Break caught: the generated archive outline skips from the page h1 to h3/h4 headings.
  const view = fixture({
    feeds: { updatedAt: '2026-08-24T08:00:00.000Z' },
    archive: {
      days: [{ date: '2026-08-23', boards: { en: [], zh: [] } }],
    },
  });

  api().init(view.root);

  assert.match(view.days.innerHTML, /<h2 class="archive-date">2026-08-23<\/h2>/);
  assert.equal((view.days.innerHTML.match(/<h3 class="board-title">/g) || []).length, 2);
  assert.doesNotMatch(view.days.innerHTML, /<h[45] class="(?:archive-date|board-title)">/);
});

test('renders policy-approved links and language labels without trusting feed markup', () => {
  // Break caught: an unsafe link or hostile title is emitted as executable HTML, or language labels regress.
  const view = fixture({
    feeds: { updatedAt: '2026-08-24T08:00:00.000Z' },
    archive: {
      days: [{
        date: '2026-08-23',
        boards: {
          en: [{
            link: 'javascript:alert(1)',
            title: '<img src=x onerror=alert(1)>',
            summary: '<script>alert(1)</script>',
            source: 'Source & Co',
            date: '2026-08-22',
            lang: 'en',
          }],
          zh: [{
            link: 'https://example.test/story',
            title: '中文标题',
            summary: '',
            source: '中文来源',
            date: '',
            lang: 'zh',
          }],
        },
      }],
    },
    urlPolicy: UrlPolicy,
  });

  api().init(view.root);

  assert.match(view.days.innerHTML, /href="#"/);
  assert.match(view.days.innerHTML, /href="https:\/\/example\.test\/story"/);
  assert.match(view.days.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(view.days.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(view.days.innerHTML, /Source &amp; Co/);
  assert.match(view.days.innerHTML, /<span class="feed-lang">国外<\/span>/);
  assert.match(view.days.innerHTML, /<span class="feed-lang">国内<\/span>/);
  assert.doesNotMatch(view.days.innerHTML, /<img|<script/);
});

test('clears archive surfaces when its data contract has no historical days', () => {
  // Break caught: missing or current-only archive data leaves stale cards or timestamps visible.
  const view = fixture({
    feeds: { updatedAt: '2026-08-24T08:00:00.000Z' },
    archive: { updatedAt: '2026-08-24T09:30:00.000Z', days: [{ date: '2026-08-24' }] },
  });
  view.days.innerHTML = 'stale archive';
  view.updated.textContent = '更新于 yesterday';

  api().init(view.root);

  assert.equal(view.days.innerHTML, '');
  assert.equal(view.updated.textContent, '');
});

test('preserves the legacy string rendering for sparse feed fields', () => {
  // Break caught: extraction changes how existing null-valued feed fields are displayed.
  const view = fixture({
    archive: {
      days: [{
        date: '2026-08-23',
        boards: { en: [{ link: 'https://example.test', title: null, summary: null, source: null }], zh: [] },
      }],
    },
    urlPolicy: UrlPolicy,
  });

  api().init(view.root);

  assert.match(view.days.innerHTML, />null<\/a>/);
  assert.match(view.days.innerHTML, /<span class="feed-meta"><span class="feed-lang">国外<\/span>null<\/span>/);
});

test('browser loading exposes ArchivePage and initializes the archive surface', () => {
  // Break caught: the browser receives the module but never renders archive data without a manual call.
  const view = fixture({
    feeds: { updatedAt: '2026-08-24T08:00:00.000Z' },
    archive: { days: [{ date: '2026-08-23', boards: { en: [], zh: [] } }] },
  });
  const source = fs.readFileSync(modulePath, 'utf8');

  vm.runInNewContext(source, view.root);

  assert.equal(typeof view.root.ArchivePage.init, 'function');
  assert.match(view.days.innerHTML, /2026-08-23/);
  assert.deepEqual(view.shellCalls, [{ target: view.root, activeNav: 'archive' }]);
});
