'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderArticlePage } = require('../scripts/article-template');
const { escapeHtml, escapeXml, jsonForInlineScript } = require('../scripts/output-encoding');

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
