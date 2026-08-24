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
    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html', 'search.html']) {
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

test('published pages declare a shared favicon that is served successfully', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html', 'search.html']) {
      const response = await fetch(`${baseUrl}/${page}`);
      const html = await response.text();
      assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/, page);
    }

    const icon = await fetch(`${baseUrl}/favicon.svg`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type') || '', /image\/svg\+xml/);
    assert.ok((await icon.text()).length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the retired about page is unavailable and no published navigation links to it', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const retired = await fetch(`${baseUrl}/about.html`);
    assert.equal(retired.status, 404);

    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html', 'search.html']) {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200, page);
      const html = await response.text();
      assert.doesNotMatch(html, /href="about\.html"/i, page);
      assert.doesNotMatch(html, /data-nav="about"/i, page);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('published pages load only their page-specific resources and share the acknowledgement', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const pageNames = ['index.html', 'tags.html', 'archive.html', 'post.html', 'search.html'];
    const pages = await Promise.all(pageNames.map(async (page) => {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200, page);
      return response.text();
    }));
    const [home, tags, archive, post, search] = pages;

    assert.match(home, /<picture class="hero-media">/);
    assert.match(home, /type="image\/avif"/);
    assert.match(home, /fetchpriority="high"/);
    assert.doesNotMatch(home, /posts-data\.js/);
    assert.match(home, /assets\/js\/posts-index\.js/);
    assert.match(home, /assets\/js\/feed-data\.js/);
    assert.match(home, /assets\/js\/stats\.js/);
    assert.match(home, /assets\/js\/likes-storage\.js/);
    assert.match(home, /assets\/js\/url-policy\.js/);
    assert.match(home, /assets\/js\/site-shell\.js/);
    assert.match(home, /assets\/js\/content-cards\.js/);
    assert.match(home, /assets\/js\/home-page\.js/);
    assert.match(home, /assets\/js\/ui-effects\.js/);
    assert.match(home, /assets\/js\/home-effects\.js/);
    assert.doesNotMatch(home, /assets\/js\/(?:feed-archive|main|search-core|search-page|archive-page|tags-page|article-page|legacy-post|post-loader|post-view)\.js/);
    const homeOrder = [
      'assets/js/feed-data.js',
      'assets/js/posts-index.js',
      'assets/js/stats.js',
      'assets/js/likes-storage.js',
      'assets/js/url-policy.js',
      'assets/js/site-shell.js',
      'assets/js/content-cards.js',
      'assets/js/home-page.js',
      'assets/js/ui-effects.js',
      'assets/js/home-effects.js',
    ].map((source) => home.indexOf(source));
    assert.ok(homeOrder.every((index) => index >= 0));
    assert.deepEqual(homeOrder, [...homeOrder].sort((left, right) => left - right));
    assert.match(tags, /assets\/js\/posts-index\.js/);
    assert.match(tags, /assets\/js\/site-shell\.js/);
    assert.match(tags, /assets\/js\/content-cards\.js/);
    assert.match(tags, /assets\/js\/stats\.js/);
    assert.match(tags, /assets\/js\/likes-storage\.js/);
    assert.match(tags, /assets\/js\/tags-page\.js/);
    assert.match(tags, /assets\/js\/ui-effects\.js/);
    assert.doesNotMatch(tags, /assets\/js\/(?:feed-data|feed-archive|url-policy|archive-page|main|search-core|search-page|article-page|legacy-post)\.js/);
    const tagsOrder = [
      'assets/js/site-shell.js',
      'assets/js/content-cards.js',
      'assets/js/posts-index.js',
      'assets/js/stats.js',
      'assets/js/likes-storage.js',
      'assets/js/tags-page.js',
    ].map((source) => tags.indexOf(source));
    assert.ok(tagsOrder.every((index) => index >= 0));
    assert.deepEqual(tagsOrder, [...tagsOrder].sort((left, right) => left - right));
    assert.match(post, /assets\/js\/posts-index\.js/);
    assert.match(post, /assets\/js\/legacy-post\.js/);
    assert.doesNotMatch(post, /assets\/js\/(?:post-loader|post-view|stats|likes-storage|main|ui-effects)\.js/);
    assert.doesNotMatch(archive, /posts-index\.js/);
    assert.match(archive, /assets\/js\/feed-data\.js/);
    assert.match(archive, /assets\/js\/feed-archive\.js/);
    assert.match(archive, /assets\/js\/url-policy\.js/);
    assert.match(archive, /assets\/js\/site-shell\.js/);
    assert.match(archive, /assets\/js\/archive-page\.js/);
    assert.match(archive, /assets\/js\/ui-effects\.js/);
    assert.doesNotMatch(archive, /assets\/js\/(?:stats|likes-storage|content-cards|main)\.js/);
    assert.match(search, /assets\/js\/site-shell\.js/);
    assert.match(search, /assets\/js\/content-cards\.js/);
    assert.match(search, /assets\/js\/search-core\.js/);
    assert.match(search, /assets\/js\/search-page\.js/);
    assert.doesNotMatch(search, /assets\/js\/(?:feed-data|feed-archive|posts-index|main|ui-effects|article-page|legacy-post)\.js/);

    for (const html of [home, tags, archive]) {
      assert.doesNotMatch(html, /assets\/js\/post-(?:loader|view)\.js/);
    }

    for (const html of pages) {
      assert.doesNotMatch(html, /posts-data\.js/);
      const acknowledgementLinks = html.match(
        /<a href="https:\/\/www\.ysjf\.com\/index" target="_blank" rel="noopener noreferrer">影视飓风<\/a>/g
      );
      assert.equal(acknowledgementLinks && acknowledgementLinks.length, 1);
      const scripts = [...html.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g)];
      for (const [, before, src, after] of scripts) {
        const attributes = `${before}${after}`;
        if (src === 'assets/js/theme.js') {
          assert.doesNotMatch(attributes, /\bdefer\b/, src);
        } else {
          assert.match(attributes, /\bdefer\b/, `${src} on published page`);
        }
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('search page exposes one labelled query field, recovery controls, and dependency-safe script order', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const response = await fetch(`${baseUrl}/search.html`);
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.equal((html.match(/<input\b/g) || []).length, 1);
    assert.match(html, /<label for="search-input"/);
    assert.match(html, /<input[^>]*id="search-input"[^>]*type="search"/);
    assert.match(html, /<button[^>]*id="search-clear"[^>]*type="button"/);
    assert.match(html, /<button[^>]*type="submit"/);
    assert.match(html, /id="search-status"[^>]*role="status"/);
    assert.match(html, /id="search-results"/);
    assert.match(html, /href="search\.html" data-nav="search"/);

    const order = [
      'assets/js/site-shell.js',
      'assets/js/content-cards.js',
      'assets/js/search-core.js',
      'assets/js/search-page.js',
    ].map((source) => html.indexOf(source));
    assert.ok(order.every((index) => index >= 0));
    assert.deepEqual(order, [...order].sort((left, right) => left - right));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('every published main navigation includes the Search destination', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html', 'search.html']) {
      const html = await (await fetch(`${baseUrl}/${page}`)).text();
      assert.match(html, /<a href="search\.html" data-nav="search">搜索<\/a>/, page);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('published pages provide a skip target and identify their top-level navigation destination', async () => {
  // Break caught: keyboard users must traverse the sticky navigation before reaching page content.
  const { server, baseUrl } = await createStaticServer();
  const pages = [
    { name: 'index.html', current: 'home' },
    { name: 'search.html', current: 'search' },
    { name: 'tags.html', current: 'tags' },
    { name: 'archive.html', current: 'archive' },
    { name: 'post.html', current: null },
    ...fs.readdirSync(path.join(__dirname, '..', 'public', 'posts'))
      .filter((name) => name.endsWith('.html'))
      .map((name) => ({ name: `posts/${name}`, current: null })),
  ];

  try {
    for (const { name, current } of pages) {
      const response = await fetch(`${baseUrl}/${name}`);
      assert.equal(response.status, 200, name);
      const html = await response.text();

      assert.match(
        html,
        /<body[^>]*>\s*<a class="skip-link" href="#main-content">跳到主要内容<\/a>/,
        `${name} starts with the skip link`
      );
      assert.match(
        html,
        /<main\b[^>]*\bid="main-content"[^>]*\btabindex="-1"[^>]*>/,
        `${name} exposes a programmatic main target`
      );
      if (current) {
        assert.match(html, new RegExp(`<a\\b[^>]*\\bdata-nav="${current}"[^>]*>`), name);
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('legacy post URL page stays a minimal redirect-and-recovery entry point', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const response = await fetch(`${baseUrl}/post.html`);
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.match(html, /<h1>文章跳转中<\/h1>/);
    assert.match(html, /href="index\.html"/);
    assert.match(html, /assets\/js\/posts-index\.js/);
    assert.match(html, /assets\/js\/site-shell\.js/);
    assert.match(html, /assets\/js\/legacy-post\.js/);
    const scriptOrder = [
      'assets/js/posts-index.js',
      'assets/js/site-shell.js',
      'assets/js/legacy-post.js',
    ].map((source) => html.indexOf(source));
    assert.deepEqual(scriptOrder, [...scriptOrder].sort((left, right) => left - right));
    assert.doesNotMatch(html, /(?:marked|highlight|stats|likes-storage|post-loader|post-view|main|ui-effects)\.js/);
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
    assert.match(html, /<picture class="hero-media">/);
    assert.match(html, /srcset="assets\/images\/hero-ink-640\.avif 640w, assets\/images\/hero-ink-1280\.avif 1280w, assets\/images\/hero-ink-1920\.avif 1920w"/);
    assert.match(html, /srcset="assets\/images\/hero-ink-640\.webp 640w, assets\/images\/hero-ink-1280\.webp 1280w, assets\/images\/hero-ink-1920\.webp 1920w"/);
    assert.match(html, /src="assets\/images\/hero-ink-1920\.png"/);
    assert.match(html, /width="1920" height="1080" decoding="async" fetchpriority="high"/);
    assert.match(html, /alt="蓝黑色流体光影抽象封面"/);
    assert.match(html, /href="#daily-section"/);
    assert.match(html, /href="#posts-title"/);
    assert.match(html, /data-motion-hero/);
    assert.match(html, /data-motion-depth="image"/);
    assert.doesNotMatch(html, /hero-motion-field/);
    assert.doesNotMatch(html, /motion-orb/);
    assert.match(html, /<canvas class="signal-field" data-signal-field aria-hidden="true"><\/canvas>/);
    assert.match(html, /data-kinetic-heading/);

    const image = await fetch(`${baseUrl}/assets/images/hero-ink-1920.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.ok((await image.arrayBuffer()).byteLength > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('homepage omits editorial issue metadata and keeps a labelled stories region', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const response = await fetch(`${baseUrl}/index.html`);
    assert.equal(response.status, 200);
    const html = await response.text();

    assert.doesNotMatch(html, /class="hero-rail"/);
    assert.doesNotMatch(html, /class="hero-instrument"/);
    assert.match(html, /<section class="posts-section" aria-labelledby="posts-title">/);
    assert.match(html, /<span class="section-index" aria-hidden="true">02<\/span>/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('desktop hero panel reclaims the space left by the removed issue rail', () => {
  const heroPanel = allRuleDeclarations(stylesheet, '.hero-panel').join('\n');

  assert.match(heroPanel, /margin:\s*76px 0 70px 40px/);
});

test('dark and light themes both map the shared frosted-glass material tokens', () => {
  const darkTokens = ruleDeclarations(stylesheet, ':root');
  const lightTokens = ruleDeclarations(stylesheet, '[data-theme="light"]');
  const glass = allRuleDeclarations(stylesheet, '.glass-surface').join('\n');

  for (const declarations of [darkTokens, lightTokens]) {
    assert.match(declarations, /--glass-surface-rgb:/);
    assert.match(declarations, /--glass-opacity:/);
    assert.match(declarations, /--glass-blur:/);
    assert.match(declarations, /--glass-edge:/);
  }

  assert.match(glass, /rgba\(var\(--glass-surface-rgb\),\s*var\(--glass-opacity\)\)/);
  assert.match(glass, /backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
});

test('hero keeps opaque dark layers when backdrop filters are unavailable', () => {
  const fallback = atRuleBlock(
    stylesheet,
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))'
  );
  const heroBase = allRuleDeclarations(stylesheet, '.hero').join('\n');
  const heroFallback = ruleDeclarations(fallback, '.hero');
  const panelFallback = ruleDeclarations(fallback, '.hero-panel');

  assert.match(heroBase, /background:\s*linear-gradient/i);
  assert.match(heroFallback, /background:\s*(?:linear-gradient|#[0-2][0-9a-f]{5})/i);
  assert.match(panelFallback, /background:\s*(?:linear-gradient|#[0-2][0-9a-f]{5})/i);
  assert.doesNotMatch(heroFallback + panelFallback, /var\(--surface(?:-strong)?\)/);
});

test('mobile and coarse Hero panels avoid expensive compositing with a readable fallback', () => {
  const coarsePointer = atRuleBlock(stylesheet, '@media (hover: none), (pointer: coarse)');
  const mobile = atRuleBlock(stylesheet, '@media (max-width: 680px)');
  const fallbackMarker =
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';
  const fallback = atRuleBlock(stylesheet, fallbackMarker);
  const coarsePanel = allRuleDeclarations(coarsePointer, '.hero-panel').join('\n');
  const mobilePanel = allRuleDeclarations(mobile, '.hero-panel').join('\n');
  const fallbackPanel = ruleDeclarations(fallback, '.hero-panel');

  for (const declarations of [coarsePanel, mobilePanel]) {
    assert.match(declarations, /box-shadow:\s*none/i);
    assert.match(declarations, /(?:-webkit-)?backdrop-filter:\s*none/i);
    const alpha = declarations.match(/background:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/i);
    assert.ok(alpha && Number(alpha[1]) >= 0.82, declarations);
  }

  assert.ok(
    stylesheet.indexOf(fallbackMarker) > stylesheet.indexOf('@media (max-width: 680px)'),
    'opaque fallback must win after responsive panel backgrounds'
  );
  assert.match(fallbackPanel, /background:\s*linear-gradient/i);
  assert.doesNotMatch(fallbackPanel, /rgba\(/i);
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

test('shared announcement utility is visually hidden but remains available to assistive technology', () => {
  const hidden = ruleDeclarations(stylesheet, '.visually-hidden');

  assert.match(hidden, /position:\s*absolute/i);
  assert.match(hidden, /width:\s*1px/i);
  assert.match(hidden, /height:\s*1px/i);
  assert.match(hidden, /overflow:\s*hidden/i);
  assert.match(hidden, /clip(?:-path)?:\s*(?:rect\(0(?:,?\s*0){3}\)|inset\(50%\))/i);
  assert.doesNotMatch(hidden, /display:\s*none|visibility:\s*hidden/i);
});
