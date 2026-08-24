'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { renderArticlePage } = require('../scripts/article-template');

const mainSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'assets', 'js', 'main.js'),
  'utf8'
);

test('generated article HTML owns its complete readable body and page-specific dependencies', () => {
  const html = renderArticlePage({
    post: {
      id: 'alpha',
      title: 'Alpha article',
      date: '2026-08-11',
      tags: ['testing'],
      summary: 'Fixture post',
      type: 'post',
      content: 'Opening paragraph.\n\n## Setup\n\n| A | B |\n| - | - |\n| 1 | 2 |',
    },
    posts: [],
    siteUrl: 'https://example.test/',
  });

  assert.match(html, /<div class="article-body"><p>Opening paragraph\.<\/p>[\s\S]*<h3 id="setup">Setup<\/h3>/);
  assert.match(html, /<table>/);
  assert.match(html, /\.\.\/assets\/js\/theme\.js/);
  assert.match(html, /\.\.\/assets\/css\/style\.css/);
  assert.match(html, /\.\.\/vendor\/highlight-theme\.css/);
  assert.match(html, /\.\.\/assets\/js\/stats\.js/);
  assert.match(html, /\.\.\/assets\/js\/likes-storage\.js/);
  assert.match(html, /\.\.\/vendor\/highlight\.min\.js/);
  assert.match(html, /\.\.\/assets\/js\/article-page\.js/);
  assert.doesNotMatch(html, /marked(?:\.min)?\.js|posts-index\.js|post-loader\.js|post-view\.js|assets\/posts\/alpha\.json/);
});

test('retired main entry point cannot fetch, replace, or report a static article', () => {
  const calls = [];
  const article = {};
  Object.defineProperty(article, 'innerHTML', {
    set() {
      calls.push('replace');
    },
  });
  const document = {
    getElementById: (id) => id === 'article' ? article : null,
  };
  const window = {
    document,
    location: { search: '?id=../alpha' },
    POSTS: [],
    PostLoader: { isValidPostId: () => false },
    PostView: { errorCardHtml: () => '<p>retired</p>' },
    fetch: () => {
      calls.push('fetch');
      return Promise.reject(new Error('must not fetch'));
    },
    Stats: {
      reportView: () => {
        calls.push('reportView');
        return Promise.resolve(1);
      },
    },
  };

  vm.runInNewContext(mainSource, { document, URLSearchParams, window });

  assert.deepEqual(calls, []);
});
