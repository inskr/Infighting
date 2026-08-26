'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ContentCards = require('../public/assets/js/content-cards.js');
const SearchCore = require('../public/assets/js/search-core.js');
const { FakeDocument } = require('./helpers/fake-dom.cjs');

const modulePath = path.join(__dirname, '..', 'public', 'assets', 'js', 'search-page.js');
let SearchPage;
try {
  SearchPage = require(modulePath);
} catch (error) {
  SearchPage = { loadError: error };
}

function api() {
  assert.equal(SearchPage.loadError, undefined, 'search page module should load');
  return SearchPage;
}

function append(document, tagName, id) {
  const node = document.createElement(tagName);
  node.setAttribute('id', id);
  document.body.appendChild(node);
  return node;
}

function fakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeout(callback, delay) {
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    pendingCount() {
      return pending.size;
    },
    pendingDelays() {
      return [...pending.values()].map(({ delay }) => delay);
    },
    async runAll() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const { callback } of callbacks) await callback();
    },
  };
}

function fixture(overrides = {}) {
  const document = new FakeDocument();
  const createElement = document.createElement.bind(document);
  document.createElement = (tagName) => {
    const element = createElement(tagName);
    element.focus = () => { document.activeElement = element; };
    return element;
  };
  const form = append(document, 'form', 'search-form');
  const input = append(document, 'input', 'search-input');
  const clear = append(document, 'button', 'search-clear');
  const status = append(document, 'p', 'search-status');
  const resultsSection = append(document, 'section', 'search-results-section');
  const resultsHeading = document.createElement('h2');
  resultsHeading.setAttribute('id', 'search-results-title');
  resultsHeading.textContent = '搜索结果';
  resultsSection.appendChild(resultsHeading);
  const results = document.createElement('div');
  results.setAttribute('id', 'search-results');
  resultsSection.appendChild(results);
  const listeners = new Map();
  const location = { pathname: '/search.html', search: overrides.locationSearch || '', hash: '' };
  const history = {
    replaceState(state, title, url) {
      const parsed = new URL(url, 'https://example.test');
      location.pathname = parsed.pathname;
      location.search = parsed.search;
      location.hash = parsed.hash;
    },
  };
  const root = {
    document,
    location,
    history,
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) { return listeners.get(type)?.({ type }); },
  };
  if (overrides.previewState) {
    root.SearchPreviewState = overrides.previewState({ document, results, root });
  }
  const fetch = overrides.fetch || (async () => {
    throw new Error('unexpected fetch');
  });
  const announcements = [];
  const controller = api().createController(root, {
    fetch,
    searchCore: overrides.searchCore || { search() { return []; } },
    contentCards: overrides.contentCards || { postCard() { throw new Error('unexpected card'); } },
    siteShell: overrides.siteShell || {
      init() {},
      announce(target, message) { announcements.push(message); },
    },
    setTimeout: overrides.setTimeout,
    clearTimeout: overrides.clearTimeout,
    metadata: overrides.metadata,
    waitForHeroPaint: overrides.waitForHeroPaint,
    waitForPreviewPaint: overrides.waitForPreviewPaint,
  });
  return {
    announcements,
    clear,
    controller,
    document,
    form,
    history,
    input,
    location,
    results,
    resultsHeading,
    resultsSection,
    root,
    status,
  };
}

function trackConnectedChildList(root) {
  let mutations = 0;

  function track(node) {
    const appendChild = node.appendChild.bind(node);
    node.appendChild = (child) => {
      mutations += 1;
      return appendChild(child);
    };
    node.children.forEach((child) => {
      const remove = child.remove.bind(child);
      child.remove = () => {
        if (child.parentNode) mutations += 1;
        return remove();
      };
      track(child);
    });
  }

  track(root);
  return { count() { return mutations; } };
}

function heroPaintRoot() {
  const hero = { id: 'search-hero-title' };
  const listeners = new Map();
  const document = {
    visibilityState: 'visible',
    getElementById(id) { return id === hero.id ? hero : null; },
    addEventListener(type, listener) { listeners.set(`document:${type}`, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(`document:${type}`) === listener) listeners.delete(`document:${type}`);
    },
  };
  const root = {
    document,
    addEventListener(type, listener) { listeners.set(`root:${type}`, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(`root:${type}`) === listener) listeners.delete(`root:${type}`);
    },
    dispatch(type) { listeners.get(`root:${type}`)?.({ type }); },
    dispatchDocument(type) { listeners.get(`document:${type}`)?.({ type }); },
  };
  return { document, hero, listeners, root };
}

function controlledPaintObserver() {
  const state = { callback: null, disconnects: 0, observations: [] };
  class Observer {
    static supportedEntryTypes = ['largest-contentful-paint'];

    constructor(callback) { state.callback = callback; }

    observe(options) { state.observations.push(options); }

    disconnect() { state.disconnects += 1; }
  }
  state.Observer = Observer;
  state.emit = (entries) => state.callback({ getEntries() { return entries; } });
  return state;
}

test('waitForHeroPaint keeps an unsupported observer fallback bounded', async () => {
  const timers = fakeTimers();
  const { root } = heroPaintRoot();
  let fallbackCalls = 0;
  const pending = api().waitForHeroPaint(root, {
    PerformanceObserver: null,
    clearTimeout: timers.clearTimeout,
    fallback() {
      fallbackCalls += 1;
      return new Promise(() => {});
    },
    setTimeout: timers.setTimeout,
    timeoutMs: 80,
  });

  assert.equal(fallbackCalls, 1);
  assert.deepEqual(timers.pendingDelays(), [80]);
  await timers.runAll();
  await pending;
  assert.equal(timers.pendingCount(), 0);
});

test('waitForHeroPaint accepts only the static Hero and cleans every resource', async () => {
  const timers = fakeTimers();
  const { hero, listeners, root } = heroPaintRoot();
  const observer = controlledPaintObserver();
  let settled = false;
  const pending = api().waitForHeroPaint(root, {
    PerformanceObserver: observer.Observer,
    clearTimeout: timers.clearTimeout,
    setTimeout: timers.setTimeout,
    timeoutMs: 500,
  }).then(() => { settled = true; });

  assert.deepEqual(observer.observations, [{ type: 'largest-contentful-paint', buffered: true }]);
  assert.equal(timers.pendingCount(), 1);
  assert.equal(listeners.size, 2);
  observer.emit([{ element: { id: 'search-results-title' } }]);
  await Promise.resolve();
  assert.equal(settled, false);

  observer.emit([{ element: hero }]);
  await pending;
  assert.equal(observer.disconnects, 1);
  assert.equal(timers.pendingCount(), 0);
  assert.equal(listeners.size, 0);
});

for (const exitPath of ['pagehide', 'hidden']) {
  test(`waitForHeroPaint releases its observer on ${exitPath}`, async () => {
    const timers = fakeTimers();
    const { document, listeners, root } = heroPaintRoot();
    const observer = controlledPaintObserver();
    const pending = api().waitForHeroPaint(root, {
      PerformanceObserver: observer.Observer,
      clearTimeout: timers.clearTimeout,
      setTimeout: timers.setTimeout,
      timeoutMs: 500,
    });

    if (exitPath === 'pagehide') root.dispatch('pagehide');
    else {
      document.visibilityState = 'hidden';
      root.dispatchDocument('visibilitychange');
    }
    await pending;
    assert.equal(observer.disconnects, 1);
    assert.equal(timers.pendingCount(), 0);
    assert.equal(listeners.size, 0);
  });
}

test('identical rendered preview fingerprint reuses the complete result tree with one completion announcement', async () => {
  // Break caught: authoritative completion rebuilds cards or mutates descendants even when every visible field is unchanged.
  const documents = [
    { id: 'alpha', title: 'Alpha needle', date: '2026-08-24', tags: ['needle'], summary: 'Alpha summary' },
    { id: 'beta', title: 'Beta needle', date: '2026-08-23', tags: [], summary: 'Beta summary' },
  ];
  let cardBuilds = 0;
  const previewCards = [];
  const view = fixture({
    fetch: async () => ({ ok: true, async json() { return documents.map((post) => ({ ...post, body: 'needle body' })); } }),
    searchCore: {
      search() {
        return documents.map((document) => ({
          document: { ...document, body: 'needle body' },
          snippet: document.summary,
          ranges: [],
        }));
      },
    },
    contentCards: {
      postCard(root, post, options) {
        cardBuilds += 1;
        return ContentCards.postCard(root, post, options);
      },
    },
    previewState({ document, results }) {
      documents.forEach((post) => {
        const card = ContentCards.postCard({ document }, post, {
          headingLevel: 3,
          showStats: false,
          summary: post.summary,
        });
        card.setAttribute('data-search-id', post.id);
        results.appendChild(card);
        previewCards.push(card);
      });
      results.setAttribute('data-search-preview', 'true');
      results.setAttribute('data-search-query', 'needle');
      results.setAttribute('aria-busy', 'true');
      return {
        kind: 'generated-metadata-preview',
        preview: true,
        query: 'needle',
        resultIds: ['alpha', 'beta'],
        fingerprint: '[["alpha","Alpha needle","2026-08-24",["needle"],"Alpha summary","Alpha summary",[]],["beta","Beta needle","2026-08-23",[],"Beta summary","Beta summary",[]]]',
        results,
      };
    },
    waitForPreviewPaint: () => Promise.resolve(),
  });
  const originalDescendants = previewCards.map((card) => ({
    heading: card.querySelector('h3'),
    meta: card.querySelector('.post-meta'),
    summary: card.querySelector('.post-summary'),
  }));
  const mutations = trackConnectedChildList(view.results);

  await view.controller.run('needle');

  assert.equal(cardBuilds, 0);
  assert.equal(mutations.count(), 0);
  assert.equal(view.results.children.length, 2);
  previewCards.forEach((card, index) => {
    assert.equal(view.results.children[index], card);
    assert.equal(card.querySelector('h3'), originalDescendants[index].heading);
    assert.equal(card.querySelector('.post-meta'), originalDescendants[index].meta);
    assert.equal(card.querySelector('.post-summary'), originalDescendants[index].summary);
  });
  assert.equal(view.results.getAttribute('data-search-preview'), null);
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
  assert.deepEqual(view.announcements, [
    '正在搜索“needle”。',
    '找到 2 篇与“needle”匹配的文章。',
  ]);
  assert.equal(view.announcements.filter((message) => message.startsWith('找到')).length, 1);
});

test('render metadata fingerprint changes retain authoritative replacement behavior', async () => {
  // Break caught: matching IDs alone preserve stale preview title, date, tags, or summary content.
  let authoritativeBuilds = 0;
  const view = fixture({
    fetch: async () => ({ ok: true, async json() { return []; } }),
    searchCore: {
      search() {
        return [{
          document: {
            id: 'same',
            title: 'Authoritative needle title',
            date: '2026-08-25',
            tags: ['updated'],
            summary: 'Authoritative metadata summary',
          },
          snippet: 'Authoritative needle snippet',
          ranges: [{ start: 14, end: 20 }],
        }];
      },
    },
    contentCards: {
      postCard(root, post, options) {
        authoritativeBuilds += 1;
        return ContentCards.postCard(root, post, options);
      },
    },
    previewState({ document, results }) {
      const post = {
        id: 'same',
        title: 'Preview needle title',
        date: '2026-08-24',
        tags: ['preview'],
        summary: 'Preview summary',
      };
      const card = ContentCards.postCard({ document }, post, {
        headingLevel: 3,
        showStats: false,
        summary: post.summary,
      });
      card.setAttribute('data-search-id', post.id);
      results.appendChild(card);
      results.setAttribute('data-search-preview', 'true');
      results.setAttribute('data-search-query', 'needle');
      results.setAttribute('aria-busy', 'true');
      return {
        kind: 'generated-metadata-preview',
        preview: true,
        query: 'needle',
        resultIds: ['same'],
        fingerprint: '[["same","Preview needle title","2026-08-24",["preview"],"Preview summary"]]',
        results,
      };
    },
    waitForPreviewPaint: () => Promise.resolve(),
  });

  await view.controller.run('needle');

  assert.equal(authoritativeBuilds, 1);
  assert.equal(view.results.querySelector('h3').textContent, 'Authoritative needle title');
  assert.equal(view.results.querySelector('.post-meta').textContent, '2026-08-25updated');
  assert.equal(view.results.querySelector('.post-summary').textContent, 'Authoritative needle snippet');
  assert.equal(view.results.getAttribute('data-search-preview'), null);
  assert.deepEqual(view.announcements.filter((message) => message.startsWith('找到')), [
    '找到 1 篇与“needle”匹配的文章。',
  ]);
});

test('initial SearchPage run adopts generated preview without recreating its heading and retains sole async ownership', async () => {
  // Break caught: SearchPage rerenders/announces the handed-off preview or bootstrap starts authoritative work itself.
  let resolveFetch;
  let previewHeading;
  const searches = [];
  const view = fixture({
    locationSearch: '?q=needle',
    fetch: () => new Promise((resolve) => { resolveFetch = resolve; }),
    metadata: [{ id: 'same', title: 'needle title', summary: 'preview', tags: [], date: '2026-08-24' }],
    searchCore: {
      search(index, query) {
        searches.push({ index, query });
        return [
          {
            document: { id: 'same', title: 'needle title', summary: 'final', body: 'needle', tags: [], date: '2026-08-24' },
            snippet: 'needle',
            ranges: [{ start: 0, end: 6 }],
          },
          {
            document: { id: 'second', title: 'second needle', summary: 'second', body: 'needle', tags: [], date: '2026-08-23' },
            snippet: 'needle second',
            ranges: [{ start: 0, end: 6 }],
          },
        ];
      },
    },
    contentCards: ContentCards,
    previewState({ document, results }) {
      const card = ContentCards.postCard({ document }, {
        id: 'same', title: 'needle title', summary: 'preview', tags: [], date: '2026-08-24',
      }, { headingLevel: 3, showStats: false, summary: 'preview' });
      card.setAttribute('data-search-id', 'same');
      results.appendChild(card);
      results.setAttribute('data-search-preview', 'true');
      results.setAttribute('data-search-active', 'true');
      results.setAttribute('data-search-query', 'needle');
      results.setAttribute('aria-busy', 'true');
      previewHeading = card.querySelector('h3');
      return { kind: 'generated-metadata-preview', preview: true, query: 'needle', resultIds: ['same'], results };
    },
    waitForPreviewPaint: () => Promise.resolve(),
  });

  const pending = view.controller.run('needle');

  assert.equal(view.results.querySelector('h3'), previewHeading);
  assert.deepEqual(searches, []);
  assert.equal(view.root.SearchPreviewState, null);
  assert.equal(view.status.textContent, '已显示快速预览，正在搜索“needle”的全文内容。');
  assert.deepEqual(view.announcements, ['正在搜索“needle”。']);

  await new Promise((resolve) => setImmediate(resolve));
  resolveFetch({ ok: true, async json() { return [{ id: 'same' }]; } });
  await pending;

  assert.equal(view.results.querySelector('h3'), previewHeading);
  assert.equal(searches.length, 1);
  assert.equal(view.results.querySelectorAll('.post-card').length, 2);
  assert.equal(view.results.querySelectorAll('h3')[1].textContent, 'second needle');
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
  assert.deepEqual(view.announcements, [
    '正在搜索“needle”。',
    '找到 2 篇与“needle”匹配的文章。',
  ]);
});

test('SearchPage discards a stale generated handoff before rendering the current query preview', async () => {
  // Break caught: a parser preview for the initial URL survives after a different run owns the Search state.
  let resolveFetch;
  const view = fixture({
    locationSearch: '?q=alpha',
    fetch: () => new Promise((resolve) => { resolveFetch = resolve; }),
    metadata: [{ id: 'beta', title: 'beta preview', summary: '', tags: [], date: '2026-08-24' }],
    searchCore: SearchCore,
    contentCards: ContentCards,
    previewState({ document, results }) {
      const card = ContentCards.postCard({ document }, {
        id: 'alpha', title: 'alpha stale', summary: '', tags: [], date: '2026-08-24',
      }, { headingLevel: 3, showStats: false });
      card.setAttribute('data-search-id', 'alpha');
      results.appendChild(card);
      results.setAttribute('data-search-preview', 'true');
      results.setAttribute('data-search-query', 'alpha');
      return { kind: 'generated-metadata-preview', preview: true, query: 'alpha', resultIds: ['alpha'], results };
    },
  });

  const pending = view.controller.run('beta');

  assert.equal(view.results.querySelector('h3').textContent, 'beta preview');
  assert.equal(view.results.getAttribute('data-search-query'), 'beta');
  assert.equal(view.root.SearchPreviewState, null);

  await new Promise((resolve) => setImmediate(resolve));
  resolveFetch({ ok: true, async json() { return []; } });
  await pending;
});

test('metadata preview paints before the full index and final results replace it with one completion announcement', async () => {
  // Break caught: the first result remains gated on the full-body index or preview is announced as final.
  let resolveFetch;
  const fetchResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const view = fixture({
    fetch: () => fetchResponse,
    metadata: [{
      id: 'preview',
      title: 'STM32 preview',
      summary: 'Fast metadata result',
      tags: ['STM32'],
      date: '2026-08-24',
    }],
    searchCore: SearchCore,
    contentCards: ContentCards,
  });

  const pending = view.controller.run('STM32');

  const sectionHeading = view.resultsHeading;
  assert.equal(view.results.querySelector('h3').textContent, 'STM32 preview');
  assert.equal(view.results.getAttribute('data-search-preview'), 'true');
  assert.equal(view.results.getAttribute('data-search-active'), 'true');
  assert.equal(view.results.getAttribute('aria-busy'), 'true');
  assert.equal(view.status.textContent, '已显示快速预览，正在搜索“STM32”的全文内容。');
  assert.deepEqual(view.announcements, ['正在搜索“STM32”。']);

  resolveFetch({
    ok: true,
    async json() {
      return [{
        id: 'final',
        title: 'STM32 authoritative result',
        summary: 'Final summary',
        body: 'STM32 full body',
        tags: [],
        date: '2026-08-25',
      }];
    },
  });
  await pending;

  assert.equal(view.results.querySelector('h3').textContent, 'STM32 authoritative result');
  assert.equal(view.resultsHeading, sectionHeading);
  assert.equal(view.resultsHeading.textContent, '搜索结果');
  assert.equal(view.results.getAttribute('data-search-preview'), null);
  assert.equal(view.results.getAttribute('data-search-active'), 'true');
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
  assert.deepEqual(view.announcements, [
    '正在搜索“STM32”。',
    '找到 1 篇与“STM32”匹配的文章。',
  ]);
});

test('a body-only match appears in the authoritative final results after an empty preview', async () => {
  // Break caught: metadata-first search accidentally drops full-body-only matches.
  let resolveFetch;
  const view = fixture({
    fetch: () => new Promise((resolve) => { resolveFetch = resolve; }),
    metadata: [{ id: 'metadata', title: 'Unrelated', summary: '', tags: [], date: '2026-08-24' }],
    searchCore: SearchCore,
    contentCards: ContentCards,
  });

  const pending = view.controller.run('bodyneedle');
  assert.equal(view.results.children.length, 0);
  assert.equal(view.results.getAttribute('data-search-preview'), 'true');
  assert.equal(view.results.getAttribute('aria-busy'), 'true');

  await new Promise((resolve) => setImmediate(resolve));
  resolveFetch({
    ok: true,
    async json() {
      return [{
        id: 'body-only',
        title: 'Body result',
        summary: '',
        tags: [],
        body: 'A bodyneedle exists only in the full document.',
        date: '2026-08-24',
      }];
    },
  });
  await pending;

  assert.equal(view.results.querySelector('h3').textContent, 'Body result');
  assert.equal(view.results.getAttribute('data-search-preview'), null);
  assert.equal(view.status.textContent, '找到 1 篇与“bodyneedle”匹配的文章。');
});

test('authoritative handoff waits for preview paint then replaces stale summaries with highlighted body snippets', async () => {
  // Break caught: matching IDs and metadata suppress the authoritative snippet/range reconciliation.
  let releasePaint;
  let authoritativeCardBuilds = 0;
  const paintCheckpoint = new Promise((resolve) => { releasePaint = resolve; });
  const view = fixture({
    fetch: async () => ({
      ok: true,
      async json() {
        return [{
          id: 'same-result',
          title: 'needle title',
          summary: 'Metadata summary',
          tags: ['needle'],
          body: 'Authoritative needle body excerpt.',
          date: '2026-08-24',
        }];
      },
    }),
    metadata: [{
      id: 'same-result',
      title: 'needle title',
      summary: 'Metadata summary',
      tags: ['needle'],
      date: '2026-08-24',
    }],
    searchCore: SearchCore,
    contentCards: {
      postCard(root, post, options) {
        authoritativeCardBuilds += 1;
        return ContentCards.postCard(root, post, options);
      },
    },
    waitForPreviewPaint: () => paintCheckpoint,
  });

  const pending = view.controller.run('needle');
  const previewHeading = view.results.querySelector('h3');
  assert.ok(previewHeading);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.results.getAttribute('data-search-preview'), 'true');
  assert.equal(view.results.querySelector('h3'), previewHeading);
  authoritativeCardBuilds = 0;

  releasePaint();
  await pending;

  assert.equal(view.results.querySelector('h3'), previewHeading);
  assert.equal(
    view.results.querySelector('.post-summary').textContent,
    '…uthoritative needle body excerpt…'
  );
  assert.equal(view.results.querySelector('mark').textContent, 'needle');
  assert.equal(authoritativeCardBuilds, 0);
  assert.equal(view.results.getAttribute('data-search-preview'), null);
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
});

test('a usable preview reaches its paint checkpoint before the full index request starts', async () => {
  // Break caught: the 242 KiB full index enters the parser-preview H3's Lighthouse dependency chain.
  let releasePaint;
  let fetchCalls = 0;
  const paintCheckpoint = new Promise((resolve) => { releasePaint = resolve; });
  const view = fixture({
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, async json() { return []; } };
    },
    metadata: [{
      id: 'preview', title: 'needle preview', summary: '', tags: [], date: '2026-08-24',
    }],
    searchCore: SearchCore,
    contentCards: ContentCards,
    waitForPreviewPaint: () => paintCheckpoint,
  });

  const pending = view.controller.run('needle');
  assert.equal(view.results.querySelector('h3').textContent, 'needle preview');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 0);

  releasePaint();
  await pending;
  assert.equal(fetchCalls, 1);
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
});

test('replacement queries replace stale previews immediately and only their final result can commit', async () => {
  // Break caught: an earlier preview or shared-index continuation renders under a newer q URL.
  let resolveFetch;
  const view = fixture({
    fetch: () => new Promise((resolve) => { resolveFetch = resolve; }),
    metadata: [
      { id: 'alpha', title: 'alpha preview', summary: '', tags: [], date: '2026-08-24' },
      { id: 'beta', title: 'beta preview', summary: '', tags: [], date: '2026-08-24' },
    ],
    searchCore: SearchCore,
    contentCards: ContentCards,
  });

  const alpha = view.controller.run('alpha');
  assert.equal(view.results.querySelector('h3').textContent, 'alpha preview');
  const beta = view.controller.run('beta');
  assert.equal(view.results.querySelector('h3').textContent, 'beta preview');

  await new Promise((resolve) => setImmediate(resolve));
  resolveFetch({
    ok: true,
    async json() {
      return [
        { id: 'alpha-final', title: 'alpha final', body: 'alpha', tags: [], date: '2026-08-24' },
        { id: 'beta-final', title: 'beta final', body: 'beta', tags: [], date: '2026-08-24' },
      ];
    },
  });
  await Promise.all([alpha, beta]);

  assert.equal(view.results.querySelector('h3').textContent, 'beta final');
  assert.equal(view.location.search, '?q=beta');
  assert.equal(view.results.getAttribute('data-search-preview'), null);
  assert.deepEqual(view.announcements.filter((message) => /找到|没有找到/.test(message)), [
    '找到 1 篇与“beta”匹配的文章。',
  ]);
});

test('marks only active index loading busy and announces one aggregate completion', async () => {
  // Break caught: loading is silent, busy survives completion, or each result is announced separately.
  let resolveFetch;
  const fetchResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const view = fixture({
    fetch: () => fetchResponse,
    searchCore: {
      search() {
        return [
          { document: { id: 'alpha', title: 'Alpha', date: '2026-08-24', tags: [] }, snippet: '', ranges: [] },
          { document: { id: 'beta', title: 'Beta', date: '2026-08-24', tags: [] }, snippet: '', ranges: [] },
        ];
      },
    },
    contentCards: ContentCards,
  });

  const pending = view.controller.run('radar');
  assert.equal(view.results.getAttribute('aria-busy'), 'true');
  assert.deepEqual(view.announcements, ['正在搜索“radar”。']);

  resolveFetch({ ok: true, async json() { return []; } });
  await pending;

  assert.equal(view.results.getAttribute('aria-busy'), 'false');
  assert.deepEqual(view.announcements, [
    '正在搜索“radar”。',
    '找到 2 篇与“radar”匹配的文章。',
  ]);
  assert.equal(view.announcements.filter((message) => message.startsWith('找到')).length, 1);
});

test('focuses Retry only after an explicit submitted search fails', async () => {
  // Break caught: failures steal focus while typing, or a submitted failure leaves recovery undiscoverable.
  const submitted = fixture({
    fetch: async () => ({ ok: false, status: 503, async json() { return []; } }),
    setTimeout,
    clearTimeout,
  });
  submitted.controller.init();
  submitted.input.value = 'submitted';
  submitted.input.focus();
  await submitted.form.dispatchEvent({ type: 'submit', preventDefault() {} });

  const submittedRetry = submitted.results.querySelector('button');
  assert.equal(submitted.document.activeElement, submittedRetry);
  assert.equal(submitted.results.getAttribute('aria-busy'), 'false');
  assert.equal(submitted.input.value, 'submitted');
  assert.equal(submitted.location.search, '?q=submitted');
  assert.deepEqual(submitted.announcements.slice(-2), [
    '正在搜索“submitted”。',
    '搜索暂时不可用，请重试。',
  ]);

  const timers = fakeTimers();
  const typed = fixture({
    fetch: async () => ({ ok: false, status: 503, async json() { return []; } }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  typed.controller.init();
  typed.input.focus();
  typed.input.value = 'typed';
  await typed.input.dispatchEvent({ type: 'input' });
  await timers.runAll();

  assert.equal(typed.document.activeElement, typed.input);
  assert.ok(typed.results.querySelector('button'));
  assert.equal(typed.results.getAttribute('aria-busy'), 'false');
});

test('an empty normalized query clears the view without fetching the index', async () => {
  // Break caught: opening or clearing Search downloads the article index unnecessarily.
  let fetchCalls = 0;
  let previewSearches = 0;
  const view = fixture({
    fetch: async () => { fetchCalls += 1; },
    metadata: [{ id: 'metadata', title: 'Metadata', summary: '', tags: [] }],
    searchCore: { search() { previewSearches += 1; return []; } },
  });

  await view.controller.run('  \u3000  ');

  assert.equal(fetchCalls, 0);
  assert.equal(previewSearches, 0);
  assert.equal(view.input.value, '');
  assert.equal(view.status.textContent, '输入关键词开始搜索。');
  assert.equal(view.results.children.length, 0);
  assert.equal(view.results.getAttribute('data-search-active'), null);
  assert.equal(view.location.search, '');
});

test('valid queries fetch the index once, reuse it, and replace the shareable URL', async () => {
  // Break caught: every query refetches data or valid search state is absent from copied URLs.
  const documents = [{ id: 'alpha', title: 'Alpha', date: '2026-08-24', tags: [], body: '' }];
  let fetchCalls = 0;
  const searched = [];
  const view = fixture({
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, async json() { return documents; } };
    },
    searchCore: {
      search(index, query) {
        searched.push({ index, query });
        return [];
      },
    },
  });

  await view.controller.run(' alpha ');
  await view.controller.run('beta');

  assert.equal(fetchCalls, 1);
  assert.deepEqual(searched, [
    { index: documents, query: 'alpha' },
    { index: documents, query: 'beta' },
  ]);
  assert.equal(view.location.search, '?q=beta');
  assert.equal(view.input.value, 'beta');
  assert.equal(view.status.textContent, '没有找到与“beta”匹配的文章。');
});

test('no-result state visibly explains the outcome and offers clear-query and tag recovery', async () => {
  // Break caught: a no-match search leaves the visible results region blank while only the live region changes.
  const view = fixture({
    fetch: async () => ({ ok: true, async json() { return []; } }),
  });

  await view.controller.run('missing');

  const state = view.results.querySelector('.search-empty-state');
  assert.ok(state);
  assert.match(state.querySelector('p').textContent, /没有找到.*missing.*尝试其他关键词/);
  const clearQuery = state.querySelector('button');
  assert.equal(clearQuery.textContent, '清除查询');
  const tags = state.querySelector('a');
  assert.equal(tags.textContent, '浏览标签');
  assert.equal(tags.getAttribute('href'), 'tags.html');

  await clearQuery.click();
  assert.equal(view.input.value, '');
  assert.equal(view.location.search, '');
  assert.equal(view.results.children.length, 0);
  assert.equal(view.document.activeElement, view.input);
});

test('results navigate to static articles and render hostile index fields as text with highlights', async () => {
  // Break caught: result HTML interpolation executes index content or loses snippet highlights/navigation.
  const view = fixture({
    fetch: async () => ({
      ok: true,
      async json() {
        return [{
          id: 'alpha/beta',
          title: '<img src=x onerror=alert(1)> needle',
          summary: 'Hostile fixture',
          tags: ['<script>alert(1)</script>'],
          date: '2026-08-24',
          body: '<svg> needle </svg>',
        }];
      },
    }),
    searchCore: SearchCore,
    contentCards: ContentCards,
  });

  await view.controller.run('needle');

  const card = view.results.querySelector('.post-card');
  assert.ok(card);
  assert.equal(card.querySelector('h3').querySelector('a').getAttribute('href'), 'posts/alpha%2Fbeta.html');
  assert.equal(card.querySelector('h3').textContent, '<img src=x onerror=alert(1)> needle');
  assert.equal(card.querySelector('.tag').textContent, '<script>alert(1)</script>');
  assert.equal(card.querySelector('.post-summary').textContent, '<svg> needle </svg>');
  assert.equal(card.querySelector('mark').textContent, 'needle');
  assert.equal(view.results.querySelectorAll('img').length, 0);
  assert.equal(view.results.querySelectorAll('script').length, 0);
  assert.equal(view.results.querySelectorAll('svg').length, 0);
  assert.equal(view.status.textContent, '找到 1 篇与“needle”匹配的文章。');
});

test('HTTP and JSON failures retain the query and expose a retry button', async () => {
  // Break caught: either index failure mode loses recovery UI or the user's query.
  const failures = [
    async () => ({ ok: false, status: 503, async json() { return []; } }),
    async () => ({ ok: true, async json() { throw new SyntaxError('invalid json'); } }),
  ];

  for (const fetch of failures) {
    const view = fixture({ fetch });
    await view.controller.run('radar');

    const retry = view.results.querySelector('button');
    const state = view.results.querySelector('.search-error-state');
    assert.ok(state);
    assert.equal(state.querySelector('p').textContent, '搜索暂时不可用。请检查网络连接后重试。');
    assert.ok(retry);
    assert.equal(retry.getAttribute('type'), 'button');
    assert.equal(retry.textContent, '重试');
    assert.equal(view.input.value, 'radar');
    assert.equal(view.location.search, '?q=radar');
    assert.equal(view.status.textContent, '搜索暂时不可用，请重试。');
  }
});

test('the rendered retry control refetches after a failure and recovers in place', async () => {
  // Break caught: a rejected cached promise makes the visible retry control permanently ineffective.
  let fetchCalls = 0;
  const view = fixture({
    fetch: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) return { ok: false, status: 500, async json() { return []; } };
      return { ok: true, async json() { return []; } };
    },
  });

  await view.controller.run('radar');
  await view.results.querySelector('button').click();

  assert.equal(fetchCalls, 2);
  assert.equal(view.results.querySelector('.search-retry'), null);
  assert.equal(view.status.textContent, '没有找到与“radar”匹配的文章。');
  assert.equal(view.input.value, 'radar');
});

test('init restores a copied q URL and activates Search navigation', async () => {
  // Break caught: shared URLs open blank or Search lacks active navigation.
  let fetchCalls = 0;
  const queries = [];
  const shellCalls = [];
  const view = fixture({
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, async json() { return []; } };
    },
    searchCore: {
      search(index, query) {
        queries.push(query);
        return [];
      },
    },
    siteShell: {
      init(root, activeNav) { shellCalls.push({ root, activeNav }); },
      announce() {},
    },
  });
  view.location.search = '?q=shared%20query';

  assert.equal(view.controller.init(), undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.input.value, 'shared query');
  assert.deepEqual(queries, ['shared query']);
  assert.equal(fetchCalls, 1);
  assert.equal(shellCalls.length, 1);
  assert.equal(shellCalls[0].root, view.root);
  assert.equal(shellCalls[0].activeNav, 'search');
});

test('rapid typing debounces search to the final trimmed query and converges URL with visible results', async () => {
  // Break caught: typing changes q without searching, or an earlier keystroke wins the rendered result race.
  const timers = fakeTimers();
  const queries = [];
  const view = fixture({
    fetch: async () => ({ ok: true, async json() { return []; } }),
    searchCore: {
      search(index, query) {
        queries.push(query);
        return [{
          document: { id: query, title: query, date: '2026-08-24', tags: [] },
          snippet: query,
          ranges: [],
        }];
      },
    },
    contentCards: ContentCards,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  view.controller.init();

  view.input.value = 'first';
  await view.input.dispatchEvent({ type: 'input' });
  view.input.value = '  final query  ';
  await view.input.dispatchEvent({ type: 'input' });

  assert.equal(timers.pendingCount(), 1);
  const [delay] = timers.pendingDelays();
  assert.ok(delay >= 150 && delay <= 250, `expected a short debounce, received ${delay}ms`);
  assert.deepEqual(queries, []);
  assert.equal(view.location.search, '?q=final+query');

  await timers.runAll();

  assert.deepEqual(queries, ['final query']);
  assert.equal(view.input.value, 'final query');
  assert.equal(view.location.search, '?q=final+query');
  assert.equal(view.results.querySelector('h3').textContent, 'final query');
  assert.equal(view.status.textContent, '找到 1 篇与“final query”匹配的文章。');
});

test('submit, clear, and popstate cancel pending debounced search work', async () => {
  // Break caught: a delayed typing search runs after an explicit navigation action and overwrites its state.
  const scenarios = [
    {
      name: 'submit',
      act: async (view) => view.form.dispatchEvent({ type: 'submit', preventDefault() {} }),
      expectedQueries: ['pending'],
      expectedSearch: '?q=pending',
    },
    {
      name: 'clear',
      act: async (view) => view.clear.click(),
      expectedQueries: [],
      expectedSearch: '',
    },
    {
      name: 'popstate',
      act: async (view) => {
        view.location.search = '?q=restored';
        return view.root.dispatch('popstate');
      },
      expectedQueries: ['restored'],
      expectedSearch: '?q=restored',
    },
  ];

  for (const scenario of scenarios) {
    const timers = fakeTimers();
    const queries = [];
    const view = fixture({
      fetch: async () => ({ ok: true, async json() { return []; } }),
      searchCore: {
        search(index, query) {
          queries.push(query);
          return [];
        },
      },
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    });
    view.controller.init();
    view.input.value = 'pending';
    await view.input.dispatchEvent({ type: 'input' });
    assert.equal(timers.pendingCount(), 1, `${scenario.name}: typing should schedule work`);

    await scenario.act(view);
    assert.equal(timers.pendingCount(), 0, `${scenario.name}: explicit action should cancel pending work`);
    await timers.runAll();

    assert.deepEqual(queries, scenario.expectedQueries, `${scenario.name}: stale typing query should not run`);
    assert.equal(view.location.search, scenario.expectedSearch);
  }
});

test('clear resets query and results while popstate restores the current q value', async () => {
  // Break caught: clear leaves stale state or browser history changes do not restore the searched query.
  const queries = [];
  const view = fixture({
    fetch: async () => ({ ok: true, async json() { return []; } }),
    searchCore: {
      search(index, query) {
        queries.push(query);
        return [];
      },
    },
  });
  view.controller.init();
  await view.controller.run('first');

  await view.clear.click();
  assert.equal(view.input.value, '');
  assert.equal(view.location.search, '');
  assert.equal(view.results.children.length, 0);
  assert.equal(view.status.textContent, '输入关键词开始搜索。');

  view.location.search = '?q=restored';
  await view.root.dispatch('popstate');
  assert.equal(view.input.value, 'restored');
  assert.equal(view.location.search, '?q=restored');
  assert.deepEqual(queries, ['first', 'restored']);
});

test('clearing during the initial fetch prevents stale results from replacing the cleared view', async () => {
  // Break caught: an earlier asynchronous search repopulates results after the user clears the page.
  let resolveFetch;
  const fetchResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const view = fixture({
    fetch: async () => fetchResponse,
    searchCore: {
      search() {
        return [{
          document: { id: 'stale', title: 'Stale', date: '2026-08-24', tags: [] },
          snippet: 'stale',
          ranges: [],
        }];
      },
    },
    contentCards: ContentCards,
  });

  const pending = view.controller.run('stale');
  await view.controller.run('');
  resolveFetch({ ok: true, async json() { return []; } });
  await pending;

  assert.equal(view.input.value, '');
  assert.equal(view.location.search, '');
  assert.equal(view.results.children.length, 0);
  assert.equal(view.status.textContent, '输入关键词开始搜索。');
});

test('typing a replacement query invalidates an older in-flight result set', async () => {
  // Break caught: the results shown after typing no longer correspond to the q value in the URL.
  let resolveFetch;
  const fetchResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const timers = fakeTimers();
  const view = fixture({
    fetch: async () => fetchResponse,
    searchCore: {
      search() {
        return [{
          document: { id: 'old', title: 'Old', date: '2026-08-24', tags: [] },
          snippet: 'old',
          ranges: [],
        }];
      },
    },
    contentCards: ContentCards,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  view.controller.init();
  const pending = view.controller.run('old');
  view.input.value = 'new';
  await view.input.dispatchEvent({ type: 'input' });
  resolveFetch({ ok: true, async json() { return []; } });
  await pending;

  assert.equal(view.input.value, 'new');
  assert.equal(view.location.search, '?q=new');
  assert.equal(view.results.children.length, 0);
});

test('an overlapping non-empty query owns busy state and the only completion announcement', async () => {
  // Break caught: a stale active query clears the newer query's busy state or announces its outcome.
  let resolveFetch;
  const fetchResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const queries = [];
  const view = fixture({
    fetch: () => fetchResponse,
    searchCore: {
      search(index, query) {
        assert.equal(view.results.getAttribute('aria-busy'), 'true');
        assert.equal(view.status.textContent, '正在搜索“beta”。');
        queries.push(query);
        return [];
      },
    },
  });

  const first = view.controller.run('alpha');
  const second = view.controller.run('beta');
  const duplicate = view.controller.run('beta');
  assert.equal(view.results.getAttribute('aria-busy'), 'true');
  assert.deepEqual(view.announcements, [
    '正在搜索“alpha”。',
    '正在搜索“beta”。',
  ]);

  resolveFetch({ ok: true, async json() { return []; } });
  await Promise.all([first, second, duplicate]);

  assert.deepEqual(queries, ['beta']);
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
  assert.equal(view.status.textContent, '没有找到与“beta”匹配的文章。');
  assert.deepEqual(view.announcements, [
    '正在搜索“alpha”。',
    '正在搜索“beta”。',
    '没有找到与“beta”匹配的文章。',
  ]);
});

test('submit restarts a same-query run that input already invalidated', async () => {
  // Break caught: active-query deduplication reuses a stale version and leaves the submitted search unfinished.
  let resolveFetch;
  const fetchResponse = new Promise((resolve) => { resolveFetch = resolve; });
  const timers = fakeTimers();
  const queries = [];
  const view = fixture({
    fetch: () => fetchResponse,
    searchCore: { search(index, query) { queries.push(query); return []; } },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  view.controller.init();
  const first = view.controller.run('alpha');
  view.input.value = ' alpha ';
  await view.input.dispatchEvent({ type: 'input' });
  const submitted = view.form.dispatchEvent({ type: 'submit', preventDefault() {} });

  resolveFetch({ ok: true, async json() { return []; } });
  await Promise.all([first, submitted]);

  assert.deepEqual(queries, ['alpha']);
  assert.equal(view.results.getAttribute('aria-busy'), 'false');
  assert.deepEqual(view.announcements, [
    '正在搜索“alpha”。',
    '正在搜索“alpha”。',
    '没有找到与“alpha”匹配的文章。',
  ]);
});

test('the browser script exposes SearchPage and initializes the page after its deferred dependencies', () => {
  // Break caught: static search.html loads the module but never binds its real controls.
  let fetchCalls = 0;
  const activeNav = [];
  const view = fixture();
  Object.assign(view.root, {
    fetch: async () => { fetchCalls += 1; },
    SearchCore: { search() { return []; } },
    ContentCards: { postCard() { throw new Error('unexpected card'); } },
    SiteShell: {
      init(root, active) { activeNav.push(active); },
      announce() {},
    },
  });
  const context = { globalThis: view.root, URL, URLSearchParams };

  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), context);

  assert.equal(typeof view.root.SearchPage.createController, 'function');
  assert.deepEqual(activeNav, ['search']);
  assert.equal(fetchCalls, 0);
  assert.equal(view.status.textContent, '输入关键词开始搜索。');
});
