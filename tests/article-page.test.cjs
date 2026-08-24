'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ArticlePage = require('../public/assets/js/article-page.js');

test('decorates static article media and code without replacing its content', () => {
  const image = {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const wrapper = {
    className: '',
    appendChild(node) {
      node.parentNode = this;
    },
  };
  const parent = {
    insertBefore(node) {
      assert.equal(node, wrapper);
    },
  };
  const table = { parentNode: parent };
  const code = {};
  const body = {
    querySelectorAll(selector) {
      if (selector === 'img') return [image];
      if (selector === 'table') return [table];
      if (selector === 'pre code') return [code];
      return [];
    },
  };
  const highlighted = [];
  const root = {
    document: { createElement: () => wrapper },
    hljs: { highlightElement: (block) => highlighted.push(block) },
  };

  assert.deepEqual(ArticlePage.decorateContent(root, body), {
    images: 1,
    tables: 1,
    codeBlocks: 1,
  });
  assert.deepEqual(image.attributes, { loading: 'lazy', decoding: 'async' });
  assert.equal(wrapper.className, 'table-wrapper');
  assert.equal(table.parentNode, wrapper);
  assert.deepEqual(highlighted, [code]);
});

test('initializes statistics from the trusted static article marker without loading article JSON', async () => {
  const viewCount = { textContent: '0' };
  const likeCount = { textContent: '0' };
  const likeButton = {
    addEventListener() {},
    getAttribute(name) {
      return name === 'data-id' ? 'alpha' : null;
    },
  };
  const body = { querySelectorAll: () => [] };
  const article = {
    getAttribute(name) {
      return name === 'data-article-id' ? 'alpha' : null;
    },
    querySelector(selector) {
      if (selector === '.article-body') return body;
      if (selector === '.view-count-num') return viewCount;
      if (selector === '.like-count') return likeCount;
      if (selector === '.like-btn') return likeButton;
      return null;
    },
  };
  const calls = [];
  const root = {
    document: {
      querySelector: (selector) => selector === '[data-article-id]' ? article : null,
      createElement() {
        throw new Error('no tables expected');
      },
    },
    fetch() {
      throw new Error('article-page must not fetch compatibility JSON');
    },
    Stats: {
      fetchStats(id) {
        calls.push(['fetchStats', id]);
        return Promise.resolve({ likeCount: 7, viewCount: 40 });
      },
      formatCount: (count) => String(count),
      getCache: () => ({ alpha: { likeCount: 7, viewCount: 40 } }),
      reportView(id) {
        calls.push(['reportView', id]);
        return Promise.resolve(41);
      },
    },
  };

  assert.equal(await ArticlePage.init(root), true);
  assert.deepEqual(calls, [['reportView', 'alpha'], ['fetchStats', 'alpha']]);
  assert.equal(viewCount.textContent, '41');
  assert.equal(likeCount.textContent, '7');
});

function fakeLikeButton() {
  const classes = new Set();
  const attributes = new Map([['data-id', 'alpha']]);
  const count = { textContent: '5' };
  return {
    attributes,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    count,
    disabled: false,
    listeners: new Map(),
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    },
    getAttribute: (name) => attributes.get(name) ?? null,
    querySelector: (selector) => selector === '.like-count' ? count : null,
    removeAttribute(name) {
      attributes.delete(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
      if (name === 'disabled') this.disabled = true;
    },
  };
}

test('initialization restores persisted like state and binds the static button', async () => {
  const button = fakeLikeButton();
  const body = { querySelectorAll: () => [] };
  const article = {
    getAttribute: (name) => name === 'data-article-id' ? 'alpha' : null,
    querySelector(selector) {
      if (selector === '.article-body') return body;
      if (selector === '.like-btn') return button;
      return null;
    },
  };
  const root = {
    document: {
      querySelector: () => article,
      createElement() {
        throw new Error('no tables expected');
      },
    },
    LikesStorage: { hasLiked: (id) => id === 'alpha' },
  };

  assert.equal(await ArticlePage.init(root), true);
  assert.equal(button.listeners.has('click'), true);
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('is-liked'), true);
  assert.equal(button.attributes.get('aria-label'), '已点赞');
});

test('keeps the static article usable when optional enhancement dependencies fail', async () => {
  const viewCount = { textContent: '0' };
  const likeCount = { textContent: '0' };
  const code = {};
  const button = fakeLikeButton();
  const body = {
    querySelectorAll(selector) {
      return selector === 'pre code' ? [code] : [];
    },
  };
  const article = {
    getAttribute: (name) => name === 'data-article-id' ? 'alpha' : null,
    querySelector(selector) {
      if (selector === '.article-body') return body;
      if (selector === '.like-btn') return button;
      if (selector === '.view-count-num') return viewCount;
      if (selector === '.like-count') return likeCount;
      return null;
    },
  };
  const root = {
    document: { querySelector: () => article },
    hljs: { highlightElement: () => { throw new Error('highlight unavailable'); } },
    LikesStorage: { hasLiked: () => { throw new Error('storage unavailable'); } },
    Stats: {
      fetchStats: () => Promise.reject(new Error('offline')),
      reportView: () => { throw new Error('offline'); },
    },
  };

  assert.equal(await ArticlePage.init(root), true);
  assert.equal(viewCount.textContent, '0');
  assert.equal(likeCount.textContent, '0');
  assert.equal(button.disabled, false);
});

test('persists a successful optimistic like from the static article button', async () => {
  const button = fakeLikeButton();
  const cache = { alpha: { viewCount: 10, likeCount: 5 } };
  const marked = [];
  let resolveLike;
  const root = {
    LikesStorage: {
      hasLiked: () => false,
      markLiked: (id) => marked.push(id),
    },
    Stats: {
      formatCount: (count) => String(count),
      getCache: () => cache,
      reportLike: () => new Promise((resolve) => { resolveLike = resolve; }),
    },
    setTimeout: (callback) => callback(),
  };

  const result = ArticlePage.handleLike(root, button, 'alpha');
  assert.equal(cache.alpha.likeCount, 6);
  assert.equal(button.count.textContent, '6');
  assert.equal(button.disabled, true);
  assert.equal(button.attributes.get('data-pending'), 'true');

  await Promise.resolve();
  resolveLike(9);
  assert.equal(await result, true);
  assert.equal(button.count.textContent, '9');
  assert.deepEqual(marked, ['alpha']);
  assert.equal(button.classList.contains('is-liked'), true);
  assert.equal(button.attributes.get('aria-label'), '已点赞');
});

test('rolls back an optimistic like when statistics reporting fails', async () => {
  const button = fakeLikeButton();
  const cache = { alpha: { viewCount: 10, likeCount: 5 } };
  const marked = [];
  const root = {
    LikesStorage: {
      hasLiked: () => false,
      markLiked: (id) => marked.push(id),
    },
    Stats: {
      formatCount: (count) => String(count),
      getCache: () => cache,
      reportLike: () => Promise.reject(new Error('offline')),
    },
    setTimeout: (callback) => callback(),
  };

  assert.equal(await ArticlePage.handleLike(root, button, 'alpha'), false);
  assert.equal(cache.alpha.likeCount, 5);
  assert.equal(button.count.textContent, '5');
  assert.equal(button.disabled, false);
  assert.equal(button.attributes.has('data-pending'), false);
  assert.equal(button.attributes.has('aria-busy'), false);
  assert.deepEqual(marked, []);
  assert.equal(button.classList.contains('is-liked'), false);
});
