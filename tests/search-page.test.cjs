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
    root,
    status,
  };
}

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
  assert.equal(view.results.querySelector('h2').textContent, 'final query');
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
