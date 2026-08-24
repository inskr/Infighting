'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const SiteShell = require('../public/assets/js/site-shell.js');
const { FakeDocument } = require('./helpers/fake-dom.cjs');

function shellFixture() {
  const document = new FakeDocument();
  const year = document.createElement('span');
  year.setAttribute('id', 'year');
  document.body.appendChild(year);

  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  ['home', 'tags', 'tags', 'archive'].forEach((key) => {
    const link = document.createElement('a');
    link.setAttribute('data-nav', key);
    link.className = 'active';
    link.setAttribute('aria-current', 'page');
    nav.appendChild(link);
  });
  document.body.appendChild(nav);
  return { document, year, links: nav.querySelectorAll('a') };
}

test('init sets the current year and leaves exactly one current navigation link', () => {
  // Break caught: stale active states survive navigation initialization.
  const fixture = shellFixture();
  SiteShell.init({ document: fixture.document }, 'tags');

  assert.equal(fixture.year.textContent, String(new Date().getFullYear()));
  assert.equal(fixture.links.filter((link) => link.getAttribute('aria-current') === 'page').length, 1);
  assert.equal(fixture.links[1].getAttribute('aria-current'), 'page');
  assert.equal(fixture.links[1].classList.contains('active'), true);
  assert.equal(fixture.links[0].classList.contains('active'), false);
});

test('announce safely updates one shared polite status surface', () => {
  // Break caught: each announcement creates another live region or parses caller text as markup.
  const fixture = shellFixture();
  const root = { document: fixture.document };
  SiteShell.announce(root, '<img src=x onerror=alert(1)>');
  SiteShell.announce(root, '筛选完成');

  const surfaces = fixture.document.querySelectorAll('[data-site-announcement]');
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].getAttribute('role'), 'status');
  assert.equal(surfaces[0].getAttribute('aria-live'), 'polite');
  assert.equal(surfaces[0].getAttribute('aria-atomic'), 'true');
  assert.equal(surfaces[0].textContent, '筛选完成');
  assert.equal(surfaces[0].querySelectorAll('img').length, 0);
});

test('home loads only its page module after durable data and shared dependencies', () => {
  // Break caught: HomePage executes without required globals or index retains unrelated page runtimes.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const sources = [
    'assets/js/feed-data.js',
    'assets/js/posts-index.js',
    'assets/js/stats.js',
    'assets/js/likes-storage.js',
    'assets/js/url-policy.js',
    'assets/js/site-shell.js',
    'assets/js/content-cards.js',
    'assets/js/home-page.js',
    'assets/js/ui-effects.js',
    'assets/js/home-effects.js',
  ];
  const order = sources.map((source) => html.indexOf(source));

  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.doesNotMatch(
    html,
    /assets\/js\/(?:main|feed-archive|search-core|search-page|archive-page|tags-page|article-page|legacy-post|post-loader|post-view)\.js/
  );

  const compatibilityPage = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'post.html'),
    'utf8'
  );
  assert.match(compatibilityPage, /assets\/js\/site-shell\.js/);
  assert.doesNotMatch(compatibilityPage, /(?:content-cards|main)\.js/);
});

test('tags loads its page module after durable post and shared-card dependencies', () => {
  // Break caught: TagsPage executes without its shell, cards, durable posts, stats, or liked-state services.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'tags.html'), 'utf8');
  const sources = [
    'assets/js/site-shell.js',
    'assets/js/content-cards.js',
    'assets/js/posts-index.js',
    'assets/js/stats.js',
    'assets/js/likes-storage.js',
    'assets/js/tags-page.js',
  ];
  const order = sources.map((source) => html.indexOf(source));

  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.doesNotMatch(html, /assets\/js\/(?:main|feed-data|feed-archive|url-policy|archive-page|search-core|search-page|article-page|legacy-post)\.js/);
});

test('archive loads only its feed, shell, policy, and visual-effect dependencies', () => {
  // Break caught: archive pulls unrelated article modules or executes before its archive data dependencies.
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'archive.html'), 'utf8');
  const sources = [
    'assets/js/feed-data.js',
    'assets/js/feed-archive.js',
    'assets/js/url-policy.js',
    'assets/js/site-shell.js',
    'assets/js/archive-page.js',
    'assets/js/ui-effects.js',
  ];
  const order = sources.map((source) => html.indexOf(source));

  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.doesNotMatch(
    html,
    /assets\/js\/(?:posts-index|stats|likes-storage|content-cards|main)\.js/
  );
});
