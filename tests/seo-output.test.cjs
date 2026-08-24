'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSite } = require('../scripts/content-publisher');
const { renderArticlePage } = require('../scripts/article-template');
const { escapeHtml, escapeXml, jsonForInlineScript } = require('../scripts/output-encoding');
const { seedStaticArticleTargets } = require('./helpers/publishing-fixture.cjs');

const SITE_URL = 'https://inskr.github.io/Infighting/';

function extractJsonLd(html) {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i
  );
  assert.ok(match, 'article page should contain JSON-LD');
  return JSON.parse(match[1]);
}

function buildHostileFixture() {
  return renderArticlePage({
    post: {
      id: 'alpha',
      title: 'Alpha </script><script>alert(1)</script>',
      summary: 'A <script>alert(2)</script> summary & description',
      date: '2026-08-11',
      tags: ['testing'],
      content: '## Body',
    },
    posts: [],
    siteUrl: SITE_URL,
  });
}

test('output encoders preserve text in their target context', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
  assert.equal(escapeXml(`<&>"'`), '&lt;&amp;&gt;&quot;&apos;');

  const json = jsonForInlineScript({ value: '</script><script>alert(1)</script>' });
  assert.equal(JSON.parse(json).value, '</script><script>alert(1)</script>');
  assert.doesNotMatch(json, /<\/script>/i);
});

test('article metadata uses absolute canonical and safe JSON-LD', () => {
  const html = buildHostileFixture();

  assert.match(
    html,
    /rel="canonical" href="https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html"/
  );
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /<meta name="description" content="A &lt;script&gt;alert\(2\)&lt;\/script&gt; summary &amp; description">/);
  assert.match(html, /<a class="back-link" href="\.\.\/index\.html">/);

  const json = extractJsonLd(html);
  assert.equal(json['@type'], 'BlogPosting');
  assert.equal(json.url, SITE_URL + 'posts/alpha.html');
  assert.equal(json.headline, 'Alpha </script><script>alert(1)</script>');
  assert.doesNotMatch(html, /<\/script><script>/i);
  assert.match(html, /\\u003c\/script>\\u003cscript>/i);
});

test('publication normalizes a site root without a trailing slash once for every SEO output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-url-normalization-'));
  const postsDir = path.join(root, 'posts');
  const withSlash = path.join(root, 'with-slash');
  const withoutSlash = path.join(root, 'without-slash');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    fs.writeFileSync(
      path.join(postsDir, 'alpha.md'),
      '---\nid: alpha\ntitle: Alpha\ndate: 2026-08-11\ntags: [testing]\n' +
        'summary: Fixture\ntype: post\n---\n# Body\n',
      'utf8'
    );
    seedStaticArticleTargets(withSlash);
    seedStaticArticleTargets(withoutSlash);

    buildSite({ postsDir, publicDir: withSlash, siteUrl: SITE_URL });
    buildSite({ postsDir, publicDir: withoutSlash, siteUrl: SITE_URL.slice(0, -1) });

    for (const relativePath of ['posts/alpha.html', 'sitemap.xml', 'rss.xml']) {
      assert.equal(
        fs.readFileSync(path.join(withoutSlash, relativePath), 'utf8'),
        fs.readFileSync(path.join(withSlash, relativePath), 'utf8'),
        relativePath
      );
    }
    const html = fs.readFileSync(path.join(withoutSlash, 'posts', 'alpha.html'), 'utf8');
    assert.equal(extractJsonLd(html).url, SITE_URL + 'posts/alpha.html');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('publication rejects a non-site SEO root before changing live output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-url-validation-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    fs.writeFileSync(
      path.join(postsDir, 'alpha.md'),
      '---\nid: alpha\ntitle: Alpha\ndate: 2026-08-11\ntags: [testing]\n' +
        'summary: Fixture\ntype: post\n---\n# Body\n',
      'utf8'
    );
    seedStaticArticleTargets(publicDir);
    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const articlePath = path.join(publicDir, 'posts', 'alpha.html');
    const before = fs.readFileSync(articlePath);

    for (const siteUrl of ['ftp://example.com/blog/', SITE_URL + '?preview=1']) {
      assert.throws(
        () => buildSite({ postsDir, publicDir, siteUrl }),
        /Invalid siteUrl/
      );
      assert.deepEqual(fs.readFileSync(articlePath), before);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
