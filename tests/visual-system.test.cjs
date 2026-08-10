'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../src/app');

const stylesheet = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'assets', 'css', 'style.css'),
  'utf8'
);

function allRuleDeclarations(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

function ruleDeclarations(source, selector) {
  const declarations = allRuleDeclarations(source, selector);
  return declarations.length ? declarations[declarations.length - 1] : '';
}

function atRuleBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  return '';
}

function createStaticServer() {
  const statsStore = {
    getAllStats() { return {}; },
    getStats() { return { viewCount: 0, likeCount: 0 }; },
    incrementView() { return 1; },
    incrementLike() { return 1; },
  };
  const app = createApp({
    statsStore,
    contentIds: new Set(),
    publicDir: path.join(__dirname, '..', 'public'),
    logger: { error() {} },
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test('published pages bootstrap theme before CSS and expose the shared navigation controls', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html', 'about.html']) {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200, page);
      const html = await response.text();
      assert.match(html, /<script src="assets\/js\/theme\.js"><\/script>/, page);
      assert.ok(html.indexOf('assets/js/theme.js') < html.indexOf('assets/css/style.css'), page);
      assert.match(html, /class="nav-shell glass-surface"/, page);
      assert.match(html, /data-theme-toggle/, page);
      assert.match(html, /aria-label="主导航"/, page);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('published homepage serves the supplied image through an accessible Hero', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const response = await fetch(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /class="hero glass-surface"/);
    assert.match(html, /src="assets\/images\/hero-ink\.png"/);
    assert.match(html, /alt="蓝黑色流体光影抽象封面"/);
    assert.match(html, /href="#daily-section"/);
    assert.match(html, /href="#posts-title"/);

    const image = await fetch(`${baseUrl}/assets/images/hero-ink.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.ok((await image.arrayBuffer()).byteLength > 100_000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('hero keeps opaque dark layers when backdrop filters are unavailable', () => {
  const fallbackStart = stylesheet.indexOf('@supports not');
  const fallbackEnd = stylesheet.indexOf('/* ================= Responsive', fallbackStart);
  const fallback = stylesheet.slice(fallbackStart, fallbackEnd);
  const heroBase = allRuleDeclarations(stylesheet, '.hero').join('\n');
  const heroFallback = ruleDeclarations(fallback, '.hero');
  const panelFallback = ruleDeclarations(fallback, '.hero-panel');

  assert.match(heroBase, /background:\s*linear-gradient/i);
  assert.match(heroFallback, /background:\s*(?:linear-gradient|#[0-2][0-9a-f]{5})/i);
  assert.match(panelFallback, /background:\s*(?:linear-gradient|#[0-2][0-9a-f]{5})/i);
  assert.doesNotMatch(heroFallback + panelFallback, /var\(--surface(?:-strong)?\)/);
});

test('spotlight and card hover effects are scoped to fine hover pointers', () => {
  const fineHover = atRuleBlock(stylesheet, '@media (hover: hover) and (pointer: fine)');
  const coarsePointer = atRuleBlock(stylesheet, '@media (hover: none), (pointer: coarse)');

  assert.match(fineHover, /\.glass-surface:hover::before\s*\{[^{}]*opacity:\s*1/s);
  assert.match(fineHover, /\.board:hover,[\s\S]*?transform:\s*translateY\(-3px\)/);
  assert.match(coarsePointer, /\.glass-surface:hover::before\s*\{[^{}]*opacity:\s*0/s);
  assert.match(coarsePointer, /\.board:hover,[\s\S]*?transform:\s*none/);
});

test('light page intro and dark hero use distinct eyebrow contrast tokens', () => {
  const rootTokens = ruleDeclarations(stylesheet, ':root');
  const pageIntroEyebrow = ruleDeclarations(stylesheet, '.page-intro .eyebrow');
  const heroEyebrow = ruleDeclarations(stylesheet, '.hero-panel .eyebrow');

  assert.match(rootTokens, /--hero-accent:\s*#67e8f9/i);
  assert.match(pageIntroEyebrow, /color:\s*var\(--accent-strong\)/);
  assert.match(heroEyebrow, /color:\s*var\(--hero-accent\)/);
});
