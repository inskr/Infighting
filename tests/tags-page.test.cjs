'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ContentCards = require('../public/assets/js/content-cards.js');
const SiteShell = require('../public/assets/js/site-shell.js');
const { FakeDocument } = require('./helpers/fake-dom.cjs');

const modulePath = path.join(__dirname, '..', 'public', 'assets', 'js', 'tags-page.js');
let TagsPage;
try {
  TagsPage = require(modulePath);
} catch (error) {
  TagsPage = { loadError: error };
}

function api() {
  assert.equal(TagsPage.loadError, undefined, 'tags page module should load');
  return TagsPage;
}

function append(document, tagName, id) {
  const node = document.createElement(tagName);
  node.setAttribute('id', id);
  document.body.appendChild(node);
  return node;
}

function post(overrides = {}) {
  return {
    id: 'alpha/beta',
    title: '<img src=x onerror=alert(1)>',
    date: '2026-08-24',
    tags: ['<script>alert(1)</script>', 'edge'],
    summary: '<svg onload=alert(1)>',
    ...overrides,
  };
}

function fixture(overrides = {}) {
  const document = new FakeDocument();
  const cloud = append(document, 'div', 'tag-cloud');
  const title = append(document, 'h2', 'tag-result-title');
  const list = append(document, 'div', 'tag-post-list');
  const year = append(document, 'span', 'year');
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  const tagsNav = document.createElement('a');
  tagsNav.setAttribute('data-nav', 'tags');
  nav.appendChild(tagsNav);
  document.body.appendChild(nav);
  const listeners = new Map();
  const cache = overrides.cache || { 'alpha/beta': { likeCount: 5, viewCount: 8 } };
  const shellCalls = [];
  const root = {
    POSTS: overrides.posts || [post(), post({ id: 'page', type: 'page', tags: ['ignored'] })],
    ContentCards: overrides.contentCards || ContentCards,
    Stats: overrides.stats || {
      fetchAllStats() { return Promise.resolve(cache); },
      formatCount(value) { return String(value); },
      getCache() { return cache; },
      reportLike() { return Promise.resolve(6); },
    },
    LikesStorage: overrides.likesStorage || { hasLiked() { return false; }, markLiked() {} },
    SiteShell: overrides.siteShell || {
      init(target, activeNav) {
        shellCalls.push({ target, activeNav });
        SiteShell.init(target, activeNav);
      },
    },
    document,
    location: { search: overrides.search || '' },
    setTimeout(callback) { callback(); },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  document.addEventListener = (type, listener) => listeners.set(type, listener);
  return { cache, cloud, document, list, listeners, root, shellCalls, tagsNav, title, year };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('renders durable tag controls and matching static article cards without injecting post fields', async () => {
  // Break caught: page records leak into tags, hostile tags become markup, or cards lose static URLs/cached stats.
  const view = fixture({
    search: '?tag=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    likesStorage: { hasLiked(id) { return id === 'alpha/beta'; }, markLiked() {} },
  });

  assert.equal(api().init(view.root), undefined);
  await settle();

  const active = view.cloud.querySelector('.active');
  const card = view.list.querySelector('.post-card');
  assert.equal(view.cloud.querySelectorAll('a').length, 2);
  assert.equal(active.textContent, '<script>alert(1)</script>1');
  assert.equal(active.getAttribute('href'), 'tags.html?tag=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  assert.equal(view.cloud.querySelectorAll('script').length, 0);
  assert.equal(card.querySelector('h2').querySelector('a').getAttribute('href'), 'posts/alpha%2Fbeta.html');
  assert.equal(card.querySelector('.like-count').textContent, '5');
  assert.equal(card.querySelector('.view-count-num').textContent, '8');
  assert.equal(card.querySelector('.like-btn').getAttribute('disabled'), '');
  assert.equal(card.querySelector('.like-btn').getAttribute('aria-label'), '已点赞');
  assert.equal(view.list.querySelectorAll('img').length, 0);
  assert.equal(view.list.querySelectorAll('svg').length, 2);
  assert.equal(view.title.textContent, '标签 "<script>alert(1)</script>" 下的文章（1 篇）');
  assert.deepEqual(view.shellCalls, [{ target: view.root, activeNav: 'tags' }]);
  assert.equal(view.tagsNav.getAttribute('aria-current'), 'page');
  assert.equal(view.year.textContent, String(new Date().getFullYear()));
});

test('activates the shared shell and presents an empty filtered result', async () => {
  // Break caught: selected tags do not activate the Tags nav or unknown tags leave stale cards behind.
  const shellCalls = [];
  const view = fixture({
    search: '?tag=missing',
    siteShell: { init(target, activeNav) { shellCalls.push({ target, activeNav }); } },
  });

  api().init(view.root);
  await settle();

  assert.equal(view.title.textContent, '标签 "missing" 下的文章（0 篇）');
  assert.equal(view.list.querySelector('.post-card'), null);
  assert.equal(view.list.querySelector('p').textContent, '该标签下暂无文章。');
  assert.deepEqual(shellCalls, [{ target: view.root, activeNav: 'tags' }]);
});

test('rolls back an optimistic tag-card like when the report fails', async () => {
  // Break caught: failed likes remain incremented or permanently disabled in tag-filtered cards.
  let rejectLike;
  const view = fixture({
    search: '?tag=edge',
    stats: {
      fetchAllStats() { return Promise.resolve(); },
      formatCount(value) { return String(value); },
      getCache() { return view.cache; },
      reportLike() { return new Promise((resolve, reject) => { rejectLike = reject; }); },
    },
  });

  api().init(view.root);
  await settle();
  const button = view.list.querySelector('.like-btn');
  const click = view.listeners.get('click');
  click({ target: { closest(selector) { return selector === '.like-btn' ? button : null; } } });

  assert.equal(view.cache['alpha/beta'].likeCount, 6);
  assert.equal(button.querySelector('.like-count').textContent, '6');
  assert.equal(button.disabled, true);
  rejectLike(new Error('offline'));
  await settle();

  assert.equal(view.cache['alpha/beta'].likeCount, 5);
  assert.equal(button.querySelector('.like-count').textContent, '5');
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('data-pending'), null);
});

test('browser loading exposes TagsPage and auto-initializes the tag page', async () => {
  // Break caught: tags.html can load the module without rendering its durable POST data.
  const view = fixture({ search: '?tag=edge' });
  const context = { globalThis: view.root, URLSearchParams, encodeURIComponent };

  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), context);
  await settle();

  assert.equal(typeof view.root.TagsPage.init, 'function');
  assert.equal(view.list.querySelectorAll('.post-card').length, 1);
  assert.deepEqual(view.shellCalls, [{ target: view.root, activeNav: 'tags' }]);
});
