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

function fixture(overrides = {}) {
  const document = new FakeDocument();
  const form = append(document, 'form', 'search-form');
  const input = append(document, 'input', 'search-input');
  const clear = append(document, 'button', 'search-clear');
  const status = append(document, 'p', 'search-status');
  const results = append(document, 'div', 'search-results');
  const listeners = new Map();
  const location = { pathname: '/search.html', search: '', hash: '' };
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
  const fetch = overrides.fetch || (async () => {
    throw new Error('unexpected fetch');
  });
  const controller = api().createController(root, {
    fetch,
    searchCore: overrides.searchCore || { search() { return []; } },
    contentCards: overrides.contentCards || { postCard() { throw new Error('unexpected card'); } },
    siteShell: overrides.siteShell || { init() {}, announce() {} },
  });
  return { clear, controller, document, form, history, input, location, results, root, status };
}

test('an empty normalized query clears the view without fetching the index', async () => {
  // Break caught: opening or clearing Search downloads the article index unnecessarily.
  let fetchCalls = 0;
  const view = fixture({ fetch: async () => { fetchCalls += 1; } });

  await view.controller.run('  \u3000  ');

  assert.equal(fetchCalls, 0);
  assert.equal(view.input.value, '');
  assert.equal(view.status.textContent, '输入关键词开始搜索。');
  assert.equal(view.results.children.length, 0);
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
  assert.equal(card.querySelector('h2').querySelector('a').getAttribute('href'), 'posts/alpha%2Fbeta.html');
  assert.equal(card.querySelector('h2').textContent, '<img src=x onerror=alert(1)> needle');
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
  assert.equal(view.results.querySelector('button'), null);
  assert.equal(view.status.textContent, '没有找到与“radar”匹配的文章。');
  assert.equal(view.input.value, 'radar');
});

test('init restores a copied q URL, activates Search navigation, and wires typing plus submit', async () => {
  // Break caught: shared URLs open blank, Search lacks active navigation, or typing reloads/fetches prematurely.
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

  view.input.value = 'next query';
  await view.input.dispatchEvent({ type: 'input' });
  assert.equal(view.location.search, '?q=next+query');
  assert.equal(fetchCalls, 1);
  assert.deepEqual(queries, ['shared query']);

  await view.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  assert.equal(fetchCalls, 1);
  assert.deepEqual(queries, ['shared query', 'next query']);
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
