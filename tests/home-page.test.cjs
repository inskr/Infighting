'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ContentCards = require('../public/assets/js/content-cards.js');
const SiteShell = require('../public/assets/js/site-shell.js');
const UrlPolicy = require('../public/assets/js/url-policy.js');
const { FakeDocument } = require('./helpers/fake-dom.cjs');

const modulePath = path.join(__dirname, '..', 'public', 'assets', 'js', 'home-page.js');
let HomePage;
try {
  HomePage = require(modulePath);
} catch (error) {
  HomePage = { loadError: error };
}

function api() {
  assert.equal(HomePage.loadError, undefined, 'home page module should load');
  return HomePage;
}

function append(document, tagName, id) {
  const node = document.createElement(tagName);
  node.setAttribute('id', id);
  document.body.appendChild(node);
  return node;
}

function post(id, overrides = {}) {
  return {
    id,
    title: `Post ${id}`,
    date: '2026-08-24',
    tags: ['edge'],
    summary: `Summary ${id}`,
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const document = new FakeDocument();
  const list = append(document, 'div', 'post-list');
  const pagination = append(document, 'nav', 'pagination');
  const postsTitle = append(document, 'h2', 'posts-title');
  const feedEn = append(document, 'ul', 'feed-en');
  const feedZh = append(document, 'ul', 'feed-zh');
  const feedUpdated = append(document, 'span', 'feed-updated');
  const year = append(document, 'span', 'year');
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  const homeNav = document.createElement('a');
  homeNav.setAttribute('data-nav', 'home');
  nav.appendChild(homeNav);
  document.body.appendChild(nav);

  const listeners = new Map();
  const cache = overrides.cache || Object.create(null);
  const shellCalls = [];
  const pushed = [];
  const scrolls = [];
  const location = { search: overrides.search || '', href: 'index.html' };
  postsTitle.scrollIntoView = (options) => scrolls.push(options);
  const root = {
    POSTS: overrides.posts || [],
    FEEDS: Object.prototype.hasOwnProperty.call(overrides, 'feeds') ? overrides.feeds : {
      updatedAt: '2026-08-24T08:00:00.000Z',
      boards: { en: [], zh: [] },
    },
    ContentCards: overrides.contentCards || ContentCards,
    UrlPolicy: overrides.urlPolicy || UrlPolicy,
    Stats: Object.prototype.hasOwnProperty.call(overrides, 'stats') ? overrides.stats : {
      fetchAllStats() { return Promise.resolve(cache); },
      formatCount(value) { return String(value); },
      getCache() { return cache; },
      reportLike() { return Promise.resolve(1); },
    },
    LikesStorage: overrides.likesStorage || { hasLiked() { return false; }, markLiked() {} },
    SiteShell: overrides.siteShell || {
      init(target, activeNav) {
        shellCalls.push({ target, activeNav });
        SiteShell.init(target, activeNav);
      },
    },
    document,
    location,
    history: {
      pushState(state, title, href) {
        pushed.push(href);
        location.search = new URL(href, 'https://example.test/').search;
      },
    },
    matchMedia(query) {
      return { matches: !!overrides.reducedMotion && query === '(prefers-reduced-motion: reduce)' };
    },
    setTimeout(callback) { callback(); },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  document.addEventListener = (type, listener) => listeners.set(type, listener);
  return {
    cache,
    document,
    feedEn,
    feedUpdated,
    feedZh,
    homeNav,
    list,
    listeners,
    pagination,
    pushed,
    root,
    scrolls,
    shellCalls,
    year,
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('clamps durable post pages and renders cached shared cards with accessible pagination', async () => {
  // Break caught: page records leak into Home, out-of-range pages render empty, or the current page is unannounced.
  const posts = [1, 2, 3, 4, 5].map((id) => post(String(id)));
  posts.splice(2, 0, post('about', { type: 'page' }));
  const view = fixture({
    posts,
    search: '?page=99',
    cache: { '5': { likeCount: 7, viewCount: 11 } },
    likesStorage: { hasLiked(id) { return id === '5'; }, markLiked() {} },
  });

  assert.equal(api().init(view.root), undefined);
  await settle();

  const cards = view.list.querySelectorAll('.post-card');
  const current = view.pagination.querySelector('.current');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].querySelector('h2').textContent, 'Post 5');
  assert.equal(cards[0].querySelector('.like-count').textContent, '7');
  assert.equal(cards[0].querySelector('.view-count-num').textContent, '11');
  assert.equal(cards[0].querySelector('.like-btn').getAttribute('disabled'), '');
  assert.equal(current.textContent, '2');
  assert.equal(current.getAttribute('aria-current'), 'page');
  assert.equal(view.pagination.querySelectorAll('a').length, 2);
  assert.deepEqual(view.shellCalls, [{ target: view.root, activeNav: 'home' }]);
  assert.equal(view.homeNav.getAttribute('aria-current'), 'page');
  assert.equal(view.year.textContent, String(new Date().getFullYear()));
});

test('pagination updates history and uses instant scrolling only for reduced motion', async () => {
  // Break caught: client-side pagination reloads, loses ?page=, or animates despite reduced-motion preference.
  for (const [reducedMotion, behavior] of [[false, 'smooth'], [true, 'auto']]) {
    const view = fixture({
      posts: [1, 2, 3, 4, 5].map((id) => post(String(id))),
      reducedMotion,
    });
    api().init(view.root);
    await settle();

    const pageTwo = view.pagination.querySelectorAll('a').find((link) => link.textContent === '2');
    let prevented = false;
    pageTwo.dispatchEvent({ type: 'click', preventDefault() { prevented = true; } });

    assert.equal(prevented, true);
    assert.deepEqual(view.pushed, ['index.html?page=2#posts-title']);
    assert.equal(view.list.querySelectorAll('.post-card').length, 1);
    assert.equal(view.list.querySelector('h2').textContent, 'Post 5');
    assert.deepEqual(view.scrolls, [{ behavior, block: 'start' }]);
  }
});

test('popstate restores the page represented by the current URL', async () => {
  // Break caught: browser Back/Forward changes the URL while leaving the prior page of cards visible.
  const view = fixture({ posts: [1, 2, 3, 4, 5].map((id) => post(String(id))) });
  api().init(view.root);
  await settle();

  view.root.location.search = '?page=2';
  view.listeners.get('popstate')();

  assert.equal(view.list.querySelectorAll('.post-card').length, 1);
  assert.equal(view.list.querySelector('h2').textContent, 'Post 5');
  assert.equal(view.pagination.querySelector('.current').textContent, '2');
});

test('renders safe dated EN and ZH feeds without trusting generated item markup', async () => {
  // Break caught: hostile feed text becomes markup, unsafe links execute, or feed language/date metadata disappears.
  const view = fixture({
    feeds: {
      updatedAt: '2026-08-24T08:00:00.000Z',
      boards: {
        en: [{
          link: 'javascript:alert(1)',
          title: '<img src=x onerror=alert(1)>',
          summary: '<script>alert(1)</script>',
          source: 'Source & Co',
          date: '2026-08-23',
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
    },
  });

  api().init(view.root);
  await settle();

  assert.equal(view.feedUpdated.textContent, '更新于 2026-08-24');
  assert.match(view.feedEn.innerHTML, /href="#"/);
  assert.match(view.feedEn.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(view.feedEn.innerHTML, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(view.feedEn.innerHTML, /Source &amp; Co · 2026-08-23/);
  assert.match(view.feedEn.innerHTML, /<span class="feed-lang">国外<\/span>/);
  assert.match(view.feedZh.innerHTML, /href="https:\/\/example\.test\/story"/);
  assert.match(view.feedZh.innerHTML, /<span class="feed-lang">国内<\/span>/);
  assert.doesNotMatch(view.feedEn.innerHTML, /<img|<script/);
});

test('keeps missing and empty feed states readable', async () => {
  // Break caught: missing data or one empty board leaves stale content and an ambiguous update label.
  const missing = fixture({ feeds: undefined });
  missing.feedEn.innerHTML = 'stale';
  missing.feedZh.innerHTML = 'stale';
  api().init(missing.root);
  await settle();
  assert.match(missing.feedEn.innerHTML, /今日内容尚未更新/);
  assert.match(missing.feedZh.innerHTML, /今日内容尚未更新/);
  assert.equal(missing.feedUpdated.textContent, '待更新');

  const empty = fixture({ feeds: { boards: { en: [], zh: [] } } });
  api().init(empty.root);
  await settle();
  assert.match(empty.feedEn.innerHTML, /暂未获取到内容/);
  assert.match(empty.feedZh.innerHTML, /暂未获取到内容/);
});

test('rolls back failed optimistic likes and persists successful likes', async () => {
  // Break caught: a failed Home like stays incremented/disabled or a successful like can be repeated after navigation.
  let rejectLike;
  const failed = fixture({
    posts: [post('alpha')],
    cache: { alpha: { likeCount: 5, viewCount: 8 } },
    stats: null,
  });
  failed.root.Stats = {
    fetchAllStats() { return Promise.resolve(); },
    formatCount(value) { return String(value); },
    getCache() { return failed.cache; },
    reportLike() { return new Promise((resolve, reject) => { rejectLike = reject; }); },
  };
  api().init(failed.root);
  await settle();
  const failedButton = failed.list.querySelector('.like-btn');
  failed.listeners.get('click')({
    target: { closest(selector) { return selector === '.like-btn' ? failedButton : null; } },
  });
  assert.equal(failed.cache.alpha.likeCount, 6);
  assert.equal(failedButton.querySelector('.like-count').textContent, '6');
  assert.equal(failedButton.disabled, true);
  rejectLike(new Error('offline'));
  await settle();
  assert.equal(failed.cache.alpha.likeCount, 5);
  assert.equal(failedButton.querySelector('.like-count').textContent, '5');
  assert.equal(failedButton.disabled, false);
  assert.equal(failedButton.getAttribute('data-pending'), null);

  const marked = [];
  const succeeded = fixture({
    posts: [post('beta')],
    likesStorage: { hasLiked() { return false; }, markLiked(id) { marked.push(id); } },
  });
  api().init(succeeded.root);
  await settle();
  const succeededButton = succeeded.list.querySelector('.like-btn');
  succeeded.listeners.get('click')({
    target: { closest(selector) { return selector === '.like-btn' ? succeededButton : null; } },
  });
  await settle();
  assert.deepEqual(marked, ['beta']);
  assert.equal(succeededButton.getAttribute('aria-label'), '已点赞');
  assert.equal(succeededButton.getAttribute('disabled'), '');
  assert.equal(succeededButton.getAttribute('aria-busy'), null);
});

test('browser loading exposes HomePage and auto-initializes the home surface', async () => {
  // Break caught: index.html loads the module but Home stays blank until an unavailable manual call.
  const view = fixture({ posts: [post('browser')] });
  const context = { globalThis: view.root, URL, URLSearchParams, encodeURIComponent };

  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), context);
  await settle();

  assert.equal(typeof view.root.HomePage.init, 'function');
  assert.equal(view.list.querySelectorAll('.post-card').length, 1);
  assert.deepEqual(view.shellCalls, [{ target: view.root, activeNav: 'home' }]);
});
