'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ContentCards = require('../public/assets/js/content-cards.js');
const SiteShell = require('../public/assets/js/site-shell.js');
const { FakeDocument } = require('./helpers/fake-dom.cjs');

function post(overrides = {}) {
  return {
    id: 'alpha/beta',
    title: '<img src=x onerror=alert(1)>',
    date: '2026-08-24',
    tags: ['<script>alert(1)</script>'],
    summary: '<svg onload=alert(1)>',
    ...overrides,
  };
}

test('postCard builds hostile caller text as text and links to the encoded static article', () => {
  // Break caught: interpolated post fields create executable markup or an invalid article URL.
  const document = new FakeDocument();
  const card = ContentCards.postCard({ document }, post(), { showStats: false });

  assert.equal(card.tagName, 'article');
  assert.equal(card.className, 'post-card glass-surface');
  assert.equal(card.querySelector('h2').querySelector('a').getAttribute('href'), 'posts/alpha%2Fbeta.html');
  assert.equal(card.querySelector('h2').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(card.querySelector('.post-summary').textContent, '<svg onload=alert(1)>');
  assert.equal(card.querySelector('.tag').textContent, '<script>alert(1)</script>');
  assert.equal(card.querySelectorAll('img').length, 0);
  assert.equal(card.querySelectorAll('script').length, 0);
  assert.equal(card.querySelectorAll('svg').length, 0);
});

test('statBar reflects cached counts and stored liked state without mutations', () => {
  // Break caught: a card fetches/mutates stats or loses the persisted disabled-liked semantics.
  const document = new FakeDocument();
  const cache = { alpha: { likeCount: 1200, viewCount: 3400 } };
  let hasLikedCalls = 0;
  const root = {
    document,
    Stats: {
      getCache() { return cache; },
      formatCount(value) { return `${value / 1000}k`; },
      fetchStats() { throw new Error('statBar must not fetch'); },
      reportLike() { throw new Error('statBar must not mutate'); },
    },
    LikesStorage: {
      hasLiked(id) {
        hasLikedCalls += 1;
        return id === 'alpha';
      },
    },
  };

  const bar = ContentCards.statBar(root, post({ id: 'alpha' }));
  const button = bar.querySelector('.like-btn');

  assert.equal(bar.className, 'stats-bar');
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.getAttribute('data-id'), 'alpha');
  assert.equal(button.getAttribute('aria-label'), '已点赞');
  assert.equal(button.getAttribute('disabled'), '');
  assert.equal(button.classList.contains('is-liked'), true);
  assert.equal(button.querySelector('.like-count').textContent, '1.2k');
  assert.equal(bar.querySelector('.view-count-num').textContent, '3.4k');
  assert.equal(bar.querySelector('.view-count').getAttribute('aria-label'), '浏览数');
  assert.equal(hasLikedCalls, 1);
  assert.deepEqual(cache, { alpha: { likeCount: 1200, viewCount: 3400 } });
});

test('statBar uses zero counts and enabled like semantics without optional services', () => {
  // Break caught: missing hosting-mode services crash card rendering.
  const document = new FakeDocument();
  const bar = ContentCards.statBar({ document }, post({ id: 'offline' }));
  const button = bar.querySelector('.like-btn');

  assert.equal(button.getAttribute('aria-label'), '点赞');
  assert.equal(button.getAttribute('disabled'), null);
  assert.equal(button.querySelector('.like-count').textContent, '0');
  assert.equal(bar.querySelector('.view-count-num').textContent, '0');
});

test('home renders list cards through the shared DOM-safe module', async () => {
  // Break caught: the Home entry point falls back to string-interpolated card markup.
  const document = new FakeDocument();
  document.documentElement = { clientHeight: 800 };
  document.addEventListener = () => {};
  const year = document.createElement('span');
  year.setAttribute('id', 'year');
  document.body.appendChild(year);
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  const home = document.createElement('a');
  home.setAttribute('data-nav', 'home');
  nav.appendChild(home);
  document.body.appendChild(nav);
  const list = document.createElement('div');
  list.setAttribute('id', 'post-list');
  document.body.appendChild(list);

  const root = {
    POSTS: [post({ id: 'shared/card' })],
    ContentCards,
    SiteShell,
    document,
    location: { search: '' },
    addEventListener() {},
  };
  const source = fs.readFileSync(path.join(
    __dirname,
    '..',
    'public',
    'assets',
    'js',
    'home-page.js'
  ), 'utf8');
  vm.runInNewContext(source, { globalThis: root, encodeURIComponent, URLSearchParams });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(list.querySelectorAll('.post-card').length, 1);
  assert.equal(
    list.querySelector('.post-card').querySelector('h2').querySelector('a').getAttribute('href'),
    'posts/shared%2Fcard.html'
  );
  assert.equal(list.querySelectorAll('img').length, 0);
  assert.equal(home.getAttribute('aria-current'), 'page');
  assert.equal(year.textContent, String(new Date().getFullYear()));
});
