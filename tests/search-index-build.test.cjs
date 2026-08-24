'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSite } = require('../scripts/build-posts');
const { createSearchIndex } = require('../scripts/search-index');
const { seedStaticArticleTargets } = require('./helpers/publishing-fixture.cjs');

const HTML_TAG_PATTERN = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*?)?\s*\/?>/;

test('builds deterministic article-only plain-text search documents', () => {
  const documents = createSearchIndex([
    {
      id: 'guide-page',
      title: 'Guide page',
      summary: 'Navigation only',
      tags: ['guide'],
      date: '2026-08-13',
      type: 'page',
      content: '# This page must not be searchable',
    },
    {
      id: 'beta_post',
      title: 'Beta board',
      summary: 'Peripheral bring-up',
      tags: ['MCU', 'SPI'],
      date: '2026-08-12',
      type: 'post',
      content:
        '# Hardware setup\n\n' +
        'Call **init_hw()** over `SPI_PROTO`.\n\n' +
        '- PA0 input\n' +
        '- PA1 output\n\n' +
        '| Pin | Mode |\n' +
        '| --- | --- |\n' +
        '| PB3 | AF1 |\n\n' +
        '```c\nuint32_t REG_A = 1;\n```\n',
    },
    {
      id: 'alpha-post',
      title: 'Alpha board',
      summary: 'Tie-break fixture',
      tags: ['MCU'],
      date: '2026-08-12',
      type: 'post',
      content: 'Alpha paragraph.',
    },
    {
      id: 'older-post',
      title: 'Older board',
      summary: 'Date-order fixture',
      tags: [],
      date: '2026-08-11',
      type: 'post',
      content: 'Older paragraph.',
    },
  ]);

  assert.deepEqual(documents.map((document) => document.id), [
    'alpha-post',
    'beta_post',
    'older-post',
  ]);
  assert.deepEqual(Object.keys(documents[1]), [
    'id',
    'title',
    'summary',
    'tags',
    'date',
    'url',
    'body',
  ]);
  assert.deepEqual(documents[1], {
    id: 'beta_post',
    title: 'Beta board',
    summary: 'Peripheral bring-up',
    tags: ['MCU', 'SPI'],
    date: '2026-08-12',
    url: 'posts/beta_post.html',
    body:
      'Hardware setup\n' +
      'Call init_hw() over SPI_PROTO.\n' +
      'PA0 input\n' +
      'PA1 output\n' +
      'Pin Mode\n' +
      'PB3 AF1\n' +
      'uint32_t REG_A = 1;',
  });
  assert.doesNotMatch(documents[1].body, /<[^>]+>|[#*`|]/);
});

test('removes raw HTML tags while retaining their visible wrapped text', () => {
  const [document] = createSearchIndex([
    {
      id: 'html-fixture',
      title: 'HTML fixture',
      summary: 'Plain-text extraction',
      tags: ['testing'],
      date: '2026-08-12',
      type: 'post',
      content:
        '**Press <kbd>CTRL_X</kbd> now.**\n\n' +
        '- [ ] Complete `READY_FLAG` validation\n\n' +
        '```mermaid\nNode["VISIBLE_A<br/>VISIBLE_B"]\n```\n\n' +
        '```html\n<div class="fixture">CODE_HTML_ID</div>\n```\n\n' +
        '```c\n#include <linux/module.h>\n```\n',
    },
  ]);

  assert.equal(
    document.body,
      'Press CTRL_X now.\n' +
      'Complete READY_FLAG validation\n' +
      'Node["VISIBLE_A VISIBLE_B"]\n' +
      'CODE_HTML_ID\n' +
      '#include <linux/module.h>'
  );
  assert.doesNotMatch(document.body, HTML_TAG_PATTERN);
});

test('publishes the search index as compact JSON with the staged site outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'search-index-publish-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    seedStaticArticleTargets(publicDir);
    fs.writeFileSync(
      path.join(postsDir, 'alpha.md'),
      '---\nid: alpha\ntitle: Alpha\ndate: 2026-08-11\ntags: [MCU]\n' +
        'summary: Alpha summary\ntype: post\n---\n# Searchable heading\n\nCall `boot_mcu()`.\n',
      'utf8'
    );

    buildSite({
      postsDir,
      publicDir,
      siteUrl: 'https://inskr.github.io/Infighting/',
    });

    const searchIndexFile = path.join(publicDir, 'assets', 'search-index.json');
    assert.equal(fs.existsSync(searchIndexFile), true);
    const source = fs.readFileSync(searchIndexFile, 'utf8');
    assert.equal(
      source,
      '[{"id":"alpha","title":"Alpha","summary":"Alpha summary","tags":["MCU"],' +
        '"date":"2026-08-11","url":"posts/alpha.html","body":"Searchable heading\\nCall boot_mcu()."}]'
    );
    assert.equal(JSON.stringify(JSON.parse(source)), source);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
