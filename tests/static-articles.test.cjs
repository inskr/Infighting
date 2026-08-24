'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSite } = require('../scripts/content-publisher');
const { renderArticlePage } = require('../scripts/article-template');
const { seedStaticArticleTargets } = require('./helpers/publishing-fixture.cjs');

const SITE_URL = 'https://inskr.github.io/Infighting/';

function withSiteFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'static-articles-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    seedStaticArticleTargets(publicDir);
    fs.mkdirSync(postsDir, { recursive: true });
    fs.writeFileSync(
      path.join(postsDir, 'alpha.md'),
      '---\n' +
        'id: alpha\n' +
        'title: Alpha\n' +
        'date: 2026-08-11\n' +
        'tags: [testing, guides]\n' +
        'summary: First post\n' +
        'type: post\n' +
        '---\n' +
        '# Overview\n\n' +
        '## Setup\n\n' +
        '## Setup\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(postsDir, 'beta.md'),
      '---\n' +
        'id: beta\n' +
        'title: Beta\n' +
        'date: 2026-08-10\n' +
        'tags: [testing]\n' +
        'summary: Second post\n' +
        'type: post\n' +
        '---\n' +
        '## Beta\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(postsDir, 'delta.md'),
      '---\n' +
        'id: delta\n' +
        'title: Delta\n' +
        'date: 2026-08-12\n' +
        'tags: [testing]\n' +
        'summary: Third post\n' +
        'type: post\n' +
        '---\n' +
        '## Delta\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(postsDir, 'gamma.md'),
      '---\n' +
        'id: gamma\n' +
        'title: Gamma\n' +
        'date: 2026-08-12\n' +
        'tags: [testing]\n' +
        'summary: Fourth post\n' +
        'type: post\n' +
        '---\n' +
        '## Gamma\n',
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

    assert.equal(result[0].id, 'delta');
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /<h1>Alpha<\/h1>/);
    assert.match(html, /<div class="article-body">[\s\S]*<h2 id="overview">Overview<\/h2>/);
    assert.match(html, /<h3 id="setup">Setup<\/h3>/);
    assert.match(html, /<article class="article glass-surface" data-article-id="alpha">/);
    assert.match(html, /<button class="like-btn" data-id="alpha"/);
    assert.match(html, /<span class="view-count-num">0<\/span>/);
    assert.match(html, /<link rel="stylesheet" href="\.\.\/vendor\/highlight-theme\.css">/);
    assert.match(html, /<script defer src="\.\.\/assets\/js\/stats\.js"><\/script>/);
    assert.match(html, /<script defer src="\.\.\/assets\/js\/likes-storage\.js"><\/script>/);
    assert.match(html, /<script defer src="\.\.\/vendor\/highlight\.min\.js"><\/script>/);
    assert.match(html, /<script defer src="\.\.\/assets\/js\/article-page\.js"><\/script>/);
    assert.doesNotMatch(html, /post-loader\.js|assets\/posts\/alpha\.json/);
    assert.equal(
      (html.match(/<article\b/g) || []).length,
      (html.match(/<\/article>/g) || []).length,
      'article markup is balanced'
    );
    assert.equal(json.content, '# Overview\n\n## Setup\n\n## Setup');
  });
});

test('article pages contain stable headings and canonical reading paths', () => {
  withSiteFixture(({ postsDir, publicDir }) => {
    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const html = fs.readFileSync(path.join(publicDir, 'posts', 'alpha.html'), 'utf8');

    assert.match(html, /<nav class="article-toc" aria-label="文章目录">/);
    assert.match(html, /<a href="#overview">Overview<\/a>/);
    assert.match(html, /<a href="#setup">Setup<\/a>/);
    assert.match(html, /<h2 id="overview">Overview<\/h2>/);
    assert.match(html, /<h3 id="setup">Setup<\/h3>/);
    assert.match(html, /<h3 id="setup-2">Setup<\/h3>/);
    assert.match(html, /<a href="\.\.\/posts\/gamma\.html">上一篇：Gamma<\/a>/);
    assert.match(html, /<a href="\.\.\/posts\/beta\.html">下一篇：Beta<\/a>/);
    assert.match(html, /href="\.\.\/tags\.html\?tag=testing"/);
    assert.match(html, /<nav class="related-posts" aria-label="相关文章">/);
    assert.doesNotMatch(html, /post\.html\?id=/);

    const relatedHtml = html.match(/<nav class="related-posts"[\s\S]*?<\/nav>/)[0];
    const deltaIndex = relatedHtml.indexOf('../posts/delta.html');
    const gammaIndex = relatedHtml.indexOf('../posts/gamma.html');
    const betaIndex = relatedHtml.indexOf('../posts/beta.html');
    assert.ok(deltaIndex < gammaIndex && gammaIndex < betaIndex);
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
      content: '# Body\n\n###### Deep',
    },
    posts: [],
    siteUrl: SITE_URL,
  });

  assert.match(html, /<h1>Alpha<\/h1>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<div class="article-body">[\s\S]*<h2 id="body">Body<\/h2>/);
  assert.match(html, /<h6 id="deep">Deep<\/h6>/);
  assert.match(html, /<a href="#body">Body<\/a>/);
  assert.match(html, /<a href="#deep">Deep<\/a>/);
});
