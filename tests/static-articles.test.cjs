'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSite } = require('../scripts/content-publisher');
const { renderArticlePage } = require('../scripts/article-template');

const SITE_URL = 'https://inskr.github.io/Infighting/';

function withSiteFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'static-articles-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    fs.writeFileSync(
      path.join(postsDir, 'alpha.md'),
      '---\n' +
        'id: alpha\n' +
        'title: Alpha\n' +
        'date: 2026-08-11\n' +
        'tags: [testing]\n' +
        'summary: First post\n' +
        'type: post\n' +
        '---\n' +
        '## Body\n',
      'utf8'
    );
    callback({ postsDir, publicDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('buildSite emits crawlable article HTML and keeps compatibility JSON', () => {
  withSiteFixture(({ postsDir, publicDir }) => {
    const result = buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const html = fs.readFileSync(path.join(publicDir, 'posts', 'alpha.html'), 'utf8');
    const json = JSON.parse(
      fs.readFileSync(path.join(publicDir, 'assets', 'posts', 'alpha.json'), 'utf8')
    );

    assert.equal(result[0].id, 'alpha');
    assert.match(html, /<h1>Alpha<\/h1>/);
    assert.match(html, /<div class="article-body">[\s\S]*<h2/);
    assert.equal(json.content, '## Body');
  });
});

test('buildSite removes the legacy aggregate document', () => {
  withSiteFixture(({ postsDir, publicDir }) => {
    const legacyFile = path.join(publicDir, 'assets', 'js', 'posts-data.js');
    fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
    fs.writeFileSync(legacyFile, 'legacy', 'utf8');

    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });

    assert.equal(fs.existsSync(legacyFile), false);
  });
});

test('renderArticlePage renders Markdown from its public post contract', () => {
  const html = renderArticlePage({
    post: {
      id: 'alpha',
      title: 'Alpha',
      date: '2026-08-11',
      tags: [],
      content: '## Body',
    },
    posts: [],
    siteUrl: SITE_URL,
  });

  assert.match(html, /<h1>Alpha<\/h1>/);
  assert.match(html, /<div class="article-body">[\s\S]*<h2>Body<\/h2>/);
});
