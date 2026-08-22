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

function cssHexVariable(declarations, name) {
  const match = declarations.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  return match && match[1];
}

function contrastRatio(foreground, background) {
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map((value) => {
      const channel = parseInt(value, 16) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
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
    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html']) {
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

test('published pages load only their page-specific resources and share the acknowledgement', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const pageNames = ['index.html', 'tags.html', 'archive.html', 'post.html'];
    const pages = await Promise.all(pageNames.map(async (page) => {
      const response = await fetch(`${baseUrl}/${page}`);
      assert.equal(response.status, 200, page);
      return response.text();
    }));
    const [home, tags, archive, post] = pages;

    assert.match(home, /<picture class="hero-media">/);
    assert.match(home, /type="image\/avif"/);
    assert.match(home, /fetchpriority="high"/);
    assert.doesNotMatch(home, /posts-data\.js/);
    assert.match(home, /assets\/js\/posts-index\.js/);
    assert.match(tags, /assets\/js\/posts-index\.js/);
    assert.match(post, /assets\/js\/posts-index\.js/);
    assert.match(post, /assets\/js\/post-loader\.js/);
    assert.match(post, /assets\/js\/post-view\.js/);
    assert.ok(post.indexOf('assets/js/post-loader.js') < post.indexOf('assets/js/post-view.js'));
    assert.ok(post.indexOf('assets/js/post-view.js') < post.indexOf('assets/js/main.js'));
    assert.doesNotMatch(archive, /posts-index\.js/);

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

test('the published site has no About destination or navigation entry', async () => {
  const { server, baseUrl } = await createStaticServer();
  try {
    const about = await fetch(`${baseUrl}/about.html`);
    assert.equal(about.status, 404);

    for (const page of ['index.html', 'tags.html', 'archive.html', 'post.html']) {
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

    const image = await fetch(`${baseUrl}/assets/images/hero-ink-1920.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.ok((await image.arrayBuffer()).byteLength > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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
  const rootTokens = ruleDeclarations(stylesheet, ':root');
  const coarsePointer = atRuleBlock(stylesheet, '@media (hover: none), (pointer: coarse)');
  const mobile = atRuleBlock(stylesheet, '@media (max-width: 680px)');
  const fallbackMarker =
    '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))';
  const fallback = atRuleBlock(stylesheet, fallbackMarker);
  const coarsePanel = allRuleDeclarations(coarsePointer, '.hero-panel').join('\n');
  const mobilePanel = allRuleDeclarations(mobile, '.hero-panel').join('\n');
  const fallbackPanel = ruleDeclarations(fallback, '.hero-panel');
  const opaquePanel = rootTokens.match(
    /--hero-panel-opaque:\s*rgba\([^)]*,\s*([\d.]+)\s*\)/i
  );

  assert.ok(opaquePanel && Number(opaquePanel[1]) >= 0.82, rootTokens);

  for (const declarations of [coarsePanel, mobilePanel]) {
    assert.match(declarations, /box-shadow:\s*none/i);
    assert.match(declarations, /(?:-webkit-)?backdrop-filter:\s*none/i);
    assert.match(declarations, /background:\s*var\(--hero-panel-opaque\)/i);
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

test('eyebrows consume semantic highlight roles from the five-color palette', () => {
  const rootTokens = ruleDeclarations(stylesheet, ':root');
  const pageIntroEyebrow = ruleDeclarations(stylesheet, '.page-intro .eyebrow');
  const heroEyebrow = ruleDeclarations(stylesheet, '.hero-panel .eyebrow');

  for (const role of ['c1', 'c2', 'c3', 'c4', 'c5']) {
    assert.match(rootTokens, new RegExp(`--palette-${role}:\\s*#[0-9a-f]{6}`, 'i'));
  }
  assert.match(rootTokens, /--accent-strong:\s*var\(--highlight\)/);
  assert.match(rootTokens, /--hero-accent:\s*var\(--highlight\)/);
  assert.match(pageIntroEyebrow, /color:\s*var\(--accent-strong\)/);
  assert.match(heroEyebrow, /color:\s*var\(--hero-accent\)/);
});

test('the dark mobile Hero keeps readable foreground roles in the light page theme', () => {
  const rootTokens = ruleDeclarations(stylesheet, ':root');
  const heroPanel = allRuleDeclarations(stylesheet, '.hero-panel').join('\n');
  const heroTitle = allRuleDeclarations(stylesheet, '.hero-panel h1').join('\n');
  const heroBody = allRuleDeclarations(stylesheet, '.hero-panel > p').join('\n');
  const heroTags = ruleDeclarations(stylesheet, '.hero-tags span');
  const ghostButton = ruleDeclarations(stylesheet, '.button-ghost');
  const primary = cssHexVariable(rootTokens, 'hero-text-primary');
  const secondary = cssHexVariable(rootTokens, 'hero-text-secondary');
  const panel = cssHexVariable(rootTokens, 'hero-panel-fallback');

  assert.ok(primary && secondary && panel);
  assert.ok(contrastRatio(primary, panel) >= 7, 'Hero title must retain enhanced contrast');
  assert.ok(contrastRatio(secondary, panel) >= 4.5, 'Hero body must retain readable contrast');
  assert.match(heroPanel, /color:\s*var\(--hero-text-secondary\)/);
  assert.match(heroTitle, /color:\s*var\(--hero-text-primary\)/);
  assert.match(heroBody, /color:\s*var\(--hero-text-secondary\)/);
  assert.match(heroTags, /color:\s*var\(--hero-text-secondary\)/);
  assert.match(ghostButton, /color:\s*var\(--hero-text-primary\)/);
});

test('the desktop Hero uses a theme-independent dark glass surface', () => {
  const rootTokens = ruleDeclarations(stylesheet, ':root');
  const heroPanel = allRuleDeclarations(stylesheet, '.hero-panel')[0] || '';
  const baseOpacity = rootTokens.match(/--hero-surface-opacity:\s*([\d.]+)/i);
  const endOpacity = rootTokens.match(/--hero-surface-end-opacity:\s*([\d.]+)/i);

  assert.match(rootTokens, /--hero-surface-rgb:\s*\d+,\s*\d+,\s*\d+/i);
  assert.match(rootTokens, /--hero-surface-end-rgb:\s*\d+,\s*\d+,\s*\d+/i);
  assert.ok(baseOpacity && Number(baseOpacity[1]) >= 0.82, rootTokens);
  assert.ok(endOpacity && Number(endOpacity[1]) >= 0.76, rootTokens);
  assert.match(heroPanel, /rgba\(var\(--hero-surface-rgb\),\s*var\(--hero-surface-opacity\)\)/i);
  assert.match(heroPanel, /rgba\(var\(--hero-surface-end-rgb\),\s*var\(--hero-surface-end-opacity\)\)/i);
  assert.doesNotMatch(heroPanel, /var\(--surface-(?:base|strong)-rgb\)/i);
});

test('Hero tags and secondary actions keep dark readable control surfaces in both themes', () => {
  const rootTokens = ruleDeclarations(stylesheet, ':root');
  const heroTags = ruleDeclarations(stylesheet, '.hero-tags span');
  const ghostButton = ruleDeclarations(stylesheet, '.button-ghost');
  const controlSurface = cssHexVariable(rootTokens, 'hero-control-surface');
  const secondary = cssHexVariable(rootTokens, 'hero-text-secondary');
  const primary = cssHexVariable(rootTokens, 'hero-text-primary');

  assert.ok(controlSurface, rootTokens);
  assert.ok(contrastRatio(secondary, controlSurface) >= 4.5, 'Hero tags need readable contrast');
  assert.ok(contrastRatio(primary, controlSurface) >= 4.5, 'Hero secondary actions need readable contrast');
  assert.match(heroTags, /background:\s*var\(--hero-control-surface\)/i);
  assert.match(ghostButton, /background:\s*var\(--hero-control-surface\)/i);
  assert.doesNotMatch(heroTags, /var\(--surface-soft-rgb\)/i);
  assert.doesNotMatch(ghostButton, /var\(--surface-soft-rgb\)/i);
});
