'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { renderArticlePage } = require('../scripts/article-template');

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

  assert.match(html, /<div class="article-body"><p>Opening paragraph\.<\/p>[\s\S]*<h2 id="setup">Setup<\/h2>/);
  assert.match(html, /<table>/);
  assert.match(html, /\.\.\/assets\/js\/theme\.js/);
  assert.match(html, /\.\.\/assets\/css\/style\.css/);
  assert.match(html, /\.\.\/vendor\/highlight-theme\.css/);
  assert.match(html, /\.\.\/assets\/js\/stats\.js/);
  assert.match(html, /\.\.\/assets\/js\/likes-storage\.js/);
  assert.match(html, /\.\.\/vendor\/highlight\.min\.js/);
  assert.match(html, /\.\.\/assets\/js\/site-shell\.js/);
  assert.match(html, /\.\.\/assets\/js\/article-page\.js/);
  assert.match(html, /\.\.\/assets\/js\/ui-effects\.js/);
  const scriptOrder = [
    '../assets/js/stats.js',
    '../assets/js/likes-storage.js',
    '../vendor/highlight.min.js',
    '../assets/js/site-shell.js',
    '../assets/js/article-page.js',
    '../assets/js/ui-effects.js',
  ].map((source) => html.indexOf(source));
  assert.deepEqual(scriptOrder, [...scriptOrder].sort((left, right) => left - right));
  assert.doesNotMatch(html, /marked(?:\.min)?\.js|posts-index\.js|post-loader\.js|post-view\.js|assets\/posts\/alpha\.json/);
});

test('generated task-list checkboxes are labelled by their task text and expose checked state', () => {
  // Break caught: Marked emits disabled checkboxes whose adjacent task text is not their accessible name.
  const html = renderArticlePage({
    post: {
      id: 'tasks',
      title: 'Task article',
      date: '2026-08-11',
      tags: ['testing'],
      summary: 'Task fixture',
      type: 'post',
      content: '- [ ] Calibrate the sensor\n- [x] Record the result',
    },
    posts: [],
    siteUrl: 'https://example.test/',
  });

  assert.match(
    html,
    /<li><label><input disabled="" type="checkbox"> Calibrate the sensor<\/label><\/li>/
  );
  assert.match(
    html,
    /<li><label><input checked="" disabled="" type="checkbox"> Record the result<\/label><\/li>/
  );
});

test('normalizes body headings from the shallowest Markdown level and preserves relative depth', () => {
  // Break caught: fixed heading demotion skips h2 when a source starts below Markdown h1.
  const cases = [
    {
      name: 'source starts at h1',
      content: '# Root One\n\n## Child One\n\n###### Deep One',
      headings: [
        '<h2 id="root-one">Root One</h2>',
        '<h3 id="child-one">Child One</h3>',
        '<h6 id="deep-one">Deep One</h6>',
      ],
      tocLevels: [2, 3, 6],
    },
    {
      name: 'source starts at h2',
      content: '## Root Two\n\n### Child Two\n\n###### Deep Two',
      headings: [
        '<h2 id="root-two">Root Two</h2>',
        '<h3 id="child-two">Child Two</h3>',
        '<h6 id="deep-two">Deep Two</h6>',
      ],
      tocLevels: [2, 3, 6],
    },
    {
      name: 'source starts deep',
      content: '#### Root Deep\n\n###### Relative Deep',
      headings: [
        '<h2 id="root-deep">Root Deep</h2>',
        '<h4 id="relative-deep">Relative Deep</h4>',
      ],
      tocLevels: [2, 4],
    },
  ];

  for (const fixture of cases) {
    const html = renderArticlePage({
      post: {
        id: 'heading-fixture',
        title: fixture.name,
        date: '2026-08-24',
        tags: [],
        content: fixture.content,
      },
      posts: [],
      siteUrl: 'https://example.test/',
    });

    assert.equal((html.match(/<h1\b/g) || []).length, 1, fixture.name);
    for (const heading of fixture.headings) assert.ok(html.includes(heading), fixture.name);
    assert.deepEqual(
      [...html.matchAll(/<li class="article-toc-level-(\d)"><a href="#[^"]+">/g)]
        .map((match) => Number(match[1])),
      fixture.tocLevels,
      fixture.name
    );
  }
});

test('radar learning article keeps consecutive published body heading levels', () => {
  // Break caught: the source jumps from the Part heading to Chapter 1, publishing h2 then h4.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'posts', '2026-07-20-radar-principles-study-summary.md'),
    'utf8'
  ).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const html = renderArticlePage({
    post: {
      id: 'radar-principles-study-summary',
      title: 'Radar learning article',
      date: '2026-07-20',
      tags: [],
      content: source,
    },
    posts: [],
    siteUrl: 'https://example.test/',
  });
  const body = html.match(/<div class="article-body">([\s\S]*?)<\/div>/)[1];
  const firstPartStart = body.indexOf('<h2 id="第一部分-雷达原理第5版逐章详细笔记">');
  const secondPartStart = body.indexOf('<h2 id="第二部分-pomrprinciples-of-modern-radar-basic-principles逐章详细笔记">');
  const firstPart = body.slice(firstPartStart, secondPartStart);

  assert.match(body, /<h2 id="第一部分-雷达原理第5版逐章详细笔记">/);
  assert.match(body, /<h3 id="第1章-绪论">第1章 绪论<\/h3>/);
  assert.doesNotMatch(body, /<h4 id="第1章-绪论">/);
  assert.equal((firstPart.match(/<h3 id="第[1-9]章-/g) || []).length, 9);
  assert.match(firstPart, /<h4 id="1-雷达是什么定义与任务">/);
  assert.doesNotMatch(firstPart, /<h[56]\b/);
});

test('keeps a heading-free body below the single page heading', () => {
  // Break caught: heading normalization invents a body heading or duplicates the page h1.
  const html = renderArticlePage({
    post: {
      id: 'no-headings',
      title: 'No headings',
      date: '2026-08-24',
      tags: [],
      content: 'Opening paragraph only.',
    },
    posts: [],
    siteUrl: 'https://example.test/',
  });
  const body = html.match(/<div class="article-body">([\s\S]*?)<\/div>/)[1];

  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.doesNotMatch(body, /<h[1-6]\b/);
  assert.match(body, /<p>Opening paragraph only\.<\/p>/);
});

test('the generated article does not require a retired multi-page runtime', () => {
  const runtime = path.join(__dirname, '..', 'public', 'assets', 'js', 'main.js');
  assert.equal(fs.existsSync(runtime), false);
});
