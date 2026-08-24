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

test('pages that load main load shared shell and card dependencies first', () => {
  // Break caught: main executes before one of its shared browser globals is available.
  for (const page of ['index.html', 'tags.html', 'archive.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
    const mainIndex = html.indexOf('assets/js/main.js');
    assert.ok(mainIndex > 0, page);
    assert.ok(html.indexOf('assets/js/site-shell.js') > 0, page);
    assert.ok(html.indexOf('assets/js/content-cards.js') > 0, page);
    assert.ok(html.indexOf('assets/js/site-shell.js') < mainIndex, page);
    assert.ok(html.indexOf('assets/js/content-cards.js') < mainIndex, page);
  }

  const compatibilityPage = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'post.html'),
    'utf8'
  );
  assert.doesNotMatch(compatibilityPage, /(?:site-shell|content-cards|main)\.js/);
});
