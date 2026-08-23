'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { renderRss, renderSitemap } = require('../scripts/discovery-output');
const { buildSite } = require('../scripts/content-publisher');

const SITE_URL = 'https://inskr.github.io/Infighting/';

const POSTS = [
  {
    id: 'beta',
    title: 'Beta',
    summary: 'Second article',
    date: '2026-08-10',
    type: 'post',
  },
  {
    id: 'alpha',
    title: 'Alpha <script>alert(1)</script> & \"quoted\"',
    summary: 'First <b>article</b> & details',
    date: '2026-08-11',
    type: 'post',
  },
  {
    id: 'gamma',
    title: 'Gamma',
    summary: 'Same day article',
    date: '2026-08-11',
    type: 'post',
  },
  {
    id: 'news-item',
    title: 'Feed news must not be syndicated',
    summary: 'External item',
    date: '2026-08-12',
    type: 'feed-news',
  },
];

test('renderSitemap publishes canonical article URLs in deterministic order', () => {
  const sitemap = renderSitemap({ posts: POSTS, siteUrl: SITE_URL });

  assert.match(sitemap, /https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html/);
  assert.doesNotMatch(sitemap, /post\.html\?id=/);
  assert.doesNotMatch(sitemap, /news-item/);
  assert.match(sitemap, /<lastmod>2026-08-11<\/lastmod>/);
  assert.ok(
    sitemap.indexOf('/posts/alpha.html') < sitemap.indexOf('/posts/gamma.html') &&
      sitemap.indexOf('/posts/gamma.html') < sitemap.indexOf('/posts/beta.html'),
    'articles should be ordered by source date descending then ID ascending'
  );
});

test('renderRss uses canonical GUIDs and escapes only static articles', () => {
  const rss = renderRss({ posts: POSTS, siteUrl: SITE_URL });

  assert.match(
    rss,
    /<guid isPermaLink="true">https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html<\/guid>/
  );
  assert.match(rss, /<title>Alpha &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quoted&quot;<\/title>/);
  assert.match(rss, /<description>First &lt;b&gt;article&lt;\/b&gt; &amp; details<\/description>/);
  assert.doesNotMatch(rss, /Feed news must not be syndicated/);
  assert.ok(
    rss.indexOf('<title>Alpha ') < rss.indexOf('<title>Gamma</title>') &&
      rss.indexOf('<title>Gamma</title>') < rss.indexOf('<title>Beta</title>'),
    'RSS items should be ordered by source date descending then ID ascending'
  );
});

test('buildSite writes sitemap and RSS beside the published article pages', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-output-'));
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
        'summary: First article\n' +
        'type: post\n' +
        '---\n' +
        '## Alpha\n',
      'utf8'
    );

    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });

    assert.match(
      fs.readFileSync(path.join(publicDir, 'sitemap.xml'), 'utf8'),
      /https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html/
    );
    assert.match(
      fs.readFileSync(path.join(publicDir, 'rss.xml'), 'utf8'),
      /<guid isPermaLink="true">https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html<\/guid>/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('homepage advertises the canonical RSS feed for feed readers', () => {
  const homepage = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  assert.match(
    homepage,
    /<link rel="alternate" type="application\/rss\+xml" title="Infighting RSS" href="https:\/\/inskr\.github\.io\/Infighting\/rss\.xml">/
  );
});
