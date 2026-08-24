'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const CSS_LIMIT_BYTES = 50 * 1024;
const SEARCH_INDEX_GZIP_LIMIT_BYTES = 150 * 1024;
const PAGE_MODULES = new Set([
  'assets/js/archive-page.js',
  'assets/js/article-page.js',
  'assets/js/home-page.js',
  'assets/js/legacy-post.js',
  'assets/js/search-page.js',
  'assets/js/tags-page.js',
]);

// This is intentionally hand-written rather than derived from production scripts.
const ROOT_ROUTES = {
  'archive.html': {
    pageModule: 'assets/js/archive-page.js',
    scripts: [
      'assets/js/theme.js', 'assets/js/feed-data.js', 'assets/js/feed-archive.js',
      'assets/js/url-policy.js', 'assets/js/site-shell.js', 'assets/js/archive-page.js',
      'assets/js/ui-effects.js',
    ],
  },
  'index.html': {
    pageModule: 'assets/js/home-page.js',
    scripts: [
      'assets/js/theme.js', 'assets/js/feed-data.js', 'assets/js/posts-index.js',
      'assets/js/stats.js', 'assets/js/likes-storage.js', 'assets/js/url-policy.js',
      'assets/js/site-shell.js', 'assets/js/content-cards.js', 'assets/js/home-page.js',
      'assets/js/ui-effects.js', 'assets/js/home-effects.js',
    ],
  },
  'post.html': {
    pageModule: 'assets/js/legacy-post.js',
    scripts: [
      'assets/js/theme.js', 'assets/js/posts-index.js', 'assets/js/site-shell.js',
      'assets/js/legacy-post.js',
    ],
  },
  'search.html': {
    pageModule: 'assets/js/search-page.js',
    scripts: [
      'assets/js/theme.js', 'assets/js/site-shell.js', 'assets/js/content-cards.js',
      'assets/js/search-core.js', 'assets/js/search-page.js',
    ],
  },
  'tags.html': {
    pageModule: 'assets/js/tags-page.js',
    scripts: [
      'assets/js/theme.js', 'assets/js/site-shell.js', 'assets/js/content-cards.js',
      'assets/js/posts-index.js', 'assets/js/stats.js', 'assets/js/likes-storage.js',
      'assets/js/tags-page.js', 'assets/js/ui-effects.js',
    ],
  },
};

const ARTICLE_ROUTE = {
  pageModule: 'assets/js/article-page.js',
  scripts: [
    'assets/js/theme.js', 'assets/js/stats.js', 'assets/js/likes-storage.js',
    'vendor/highlight.min.js', 'assets/js/site-shell.js', 'assets/js/article-page.js',
    'assets/js/ui-effects.js',
  ],
};

function listPublishedHtml(publicDir) {
  const rootPages = fs.readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name);
  const articleDir = path.join(publicDir, 'posts');
  const articlePages = fs.readdirSync(articleDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.posix.join('posts', entry.name));
  return [...rootPages, ...articlePages].sort();
}

function isWhitespace(character) {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t' || character === '\f';
}

function isScriptBoundary(character) {
  return character === undefined || isWhitespace(character) || character === '/' || character === '>';
}

function readOpeningScriptTag(html, start) {
  const nameStart = start + 1;
  if (html.slice(nameStart, nameStart + 6).toLowerCase() !== 'script') return null;

  let cursor = nameStart + 6;
  if (!isScriptBoundary(html[cursor])) return null;
  let source = null;

  while (cursor < html.length) {
    while (isWhitespace(html[cursor])) cursor += 1;
    if (html[cursor] === '>') return { end: cursor + 1, source };
    if (html[cursor] === '/' && html[cursor + 1] === '>') return { end: cursor + 2, source };

    const attributeStart = cursor;
    while (
      cursor < html.length &&
      !isWhitespace(html[cursor]) &&
      html[cursor] !== '=' &&
      html[cursor] !== '>' &&
      html[cursor] !== '/'
    ) cursor += 1;
    if (attributeStart === cursor) return null;

    const attributeName = html.slice(attributeStart, cursor).toLowerCase();
    while (isWhitespace(html[cursor])) cursor += 1;
    let attributeValue = '';
    if (html[cursor] === '=') {
      cursor += 1;
      while (isWhitespace(html[cursor])) cursor += 1;
      const quote = html[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < html.length && html[cursor] !== quote) cursor += 1;
        attributeValue = html.slice(valueStart, cursor);
        if (cursor < html.length) cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < html.length && !isWhitespace(html[cursor]) && html[cursor] !== '>') cursor += 1;
        attributeValue = html.slice(valueStart, cursor);
      }
    }

    if (attributeName === 'src' && source === null) source = attributeValue;
  }

  return null;
}

function readClosingScriptTag(html, start) {
  const nameStart = start + 2;
  if (html.slice(nameStart, nameStart + 6).toLowerCase() !== 'script') return null;
  if (!isScriptBoundary(html[nameStart + 6])) return null;

  let quote = null;
  for (let cursor = nameStart + 6; cursor < html.length; cursor += 1) {
    const character = html[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return cursor + 1;
    }
  }
  return html.length;
}

function scriptSources(htmlPath, html) {
  const baseUrl = new URL(`/${htmlPath}`, 'https://resource-budget.invalid');
  const sources = [];
  let cursor = 0;

  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart === -1) break;
    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      cursor = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const openingTag = readOpeningScriptTag(html, tagStart);
    if (!openingTag) {
      cursor = tagStart + 1;
      continue;
    }

    if (openingTag.source !== null) {
      const sourceUrl = new URL(openingTag.source, baseUrl);
      sources.push(
        sourceUrl.origin === baseUrl.origin
          ? sourceUrl.pathname.replace(/^\//, '')
          : sourceUrl.href
      );
    }

    const bodyStart = openingTag.end;
    let bodyCursor = bodyStart;
    while (bodyCursor < html.length) {
      const closeStart = html.indexOf('<', bodyCursor);
      if (closeStart === -1) {
        bodyCursor = html.length;
        break;
      }
      const closingTag = html[closeStart + 1] === '/' ? readClosingScriptTag(html, closeStart) : null;
      if (closingTag) {
        bodyCursor = closingTag;
        break;
      }
      bodyCursor = closeStart + 1;
    }
    cursor = bodyCursor;
  }

  return sources;
}

function deterministicIncompressibleBytes(length, seed) {
  let state = seed >>> 0;
  const bytes = Buffer.allocUnsafe(length);
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}

function assertRoute(publicDir, htmlPath, rule) {
  const html = fs.readFileSync(path.join(publicDir, ...htmlPath.split('/')), 'utf8');
  const scripts = scriptSources(htmlPath, html);
  const pageModules = scripts.filter((script) => PAGE_MODULES.has(script));

  if (htmlPath.startsWith('posts/')) {
    assert.doesNotMatch(
      html,
      /assets\/posts\/[^"'<>\s]+\.json(?:[?#][^"'<>\s]*)?/i,
      `${htmlPath} must not request article JSON`
    );
  }

  assert.deepEqual(
    pageModules,
    [rule.pageModule],
    `${htmlPath} must declare exactly its one page Module`
  );
  assert.deepEqual(scripts, rule.scripts, `${htmlPath} must only load its declared dependencies`);
  assert.doesNotMatch(
    html,
    /assets\/search-index\.json/i,
    `${htmlPath} must not statically request the search index`
  );
}

function assertPublishedArtifacts(publicDir, rootRoutes = ROOT_ROUTES, articleRoute = ARTICLE_ROUTE) {
  const allPages = listPublishedHtml(publicDir);
  const rootPages = allPages.filter((htmlPath) => !htmlPath.startsWith('posts/'));
  assert.deepEqual(rootPages, Object.keys(rootRoutes).sort(), 'root publication routes must be allowlisted');

  for (const htmlPath of rootPages) assertRoute(publicDir, htmlPath, rootRoutes[htmlPath]);
  for (const htmlPath of allPages.filter((page) => page.startsWith('posts/'))) {
    assertRoute(publicDir, htmlPath, articleRoute);
  }

  const cssBytes = fs.statSync(path.join(publicDir, 'assets', 'css', 'style.css')).size;
  assert.ok(cssBytes <= CSS_LIMIT_BYTES, `CSS budget exceeded: ${cssBytes} > ${CSS_LIMIT_BYTES}`);
  const indexBytes = zlib.gzipSync(
    fs.readFileSync(path.join(publicDir, 'assets', 'search-index.json'))
  ).length;
  assert.ok(
    indexBytes <= SEARCH_INDEX_GZIP_LIMIT_BYTES,
    `search-index gzip budget exceeded: ${indexBytes} > ${SEARCH_INDEX_GZIP_LIMIT_BYTES}`
  );
}

function withFixture(callback) {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'performance-budget-'));
  const fixtureRoutes = {
    'index.html': {
      pageModule: 'assets/js/home-page.js',
      scripts: ['assets/js/theme.js', 'assets/js/site-shell.js', 'assets/js/home-page.js'],
    },
  };
  const fixtureArticleRoute = {
    pageModule: 'assets/js/article-page.js',
    scripts: ['assets/js/theme.js', 'assets/js/site-shell.js', 'assets/js/article-page.js'],
  };

  try {
    fs.mkdirSync(path.join(publicDir, 'assets', 'css'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'posts'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'assets', 'css', 'style.css'), 'body{}');
    fs.writeFileSync(path.join(publicDir, 'assets', 'search-index.json'), '[]');
    fs.writeFileSync(
      path.join(publicDir, 'index.html'),
      '<script src="assets/js/theme.js"></script><script src="assets/js/site-shell.js"></script><script src="assets/js/home-page.js"></script>'
    );
    fs.writeFileSync(
      path.join(publicDir, 'posts', 'example.html'),
      '<script src="../assets/js/theme.js"></script><script src="../assets/js/site-shell.js"></script><script src="../assets/js/article-page.js"></script>'
    );
    callback({ articlePath: path.join(publicDir, 'posts', 'example.html'), fixtureArticleRoute, fixtureRoutes, publicDir });
  } finally {
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
}

test('published CSS, search index, and every HTML script map stay within their resource contracts', () => {
  // Break caught: an oversized artifact, a page-only module on another route, or an undeclared helper ships.
  assertPublishedArtifacts(path.join(__dirname, '..', 'public'));
});

test('controlled fixtures prove each resource contract rejects a regression', () => {
  // Break caught: a green-only gate that would silently accept an over-budget or cross-route regression.
  withFixture(({ articlePath, fixtureArticleRoute, fixtureRoutes, publicDir }) => {
    fs.writeFileSync(path.join(publicDir, 'assets', 'css', 'style.css'), Buffer.alloc(CSS_LIMIT_BYTES + 1));
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /CSS budget exceeded/
    );

    fs.writeFileSync(path.join(publicDir, 'assets', 'css', 'style.css'), 'body{}');
    const overflowIndex = deterministicIncompressibleBytes(
      SEARCH_INDEX_GZIP_LIMIT_BYTES + 1,
      0x1a2b3c4d
    );
    assert.ok(zlib.gzipSync(overflowIndex).length > SEARCH_INDEX_GZIP_LIMIT_BYTES);
    fs.writeFileSync(path.join(publicDir, 'assets', 'search-index.json'), overflowIndex);
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /search-index gzip budget exceeded/
    );

    fs.writeFileSync(path.join(publicDir, 'assets', 'search-index.json'), '[]');
    fs.writeFileSync(
      path.join(publicDir, 'index.html'),
      '<script src="assets/js/theme.js"></script><script src="assets/js/site-shell.js"></script><script src="assets/js/article-page.js"></script>'
    );
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /exactly its one page Module/
    );

    fs.writeFileSync(
      path.join(publicDir, 'index.html'),
      '<script src="assets/js/theme.js"></script><script src="assets/js/site-shell.js"></script><script src="assets/js/home-page.js"></script><script src="assets/js/extra-helper.js"></script>'
    );
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /only load its declared dependencies/
    );

    fs.writeFileSync(
      path.join(publicDir, 'index.html'),
      '<script src="assets/js/theme.js"></script><script src="assets/js/site-shell.js"></script><script src="assets/js/home-page.js"></script>'
    );
    fs.appendFileSync(articlePath, '<script src="../assets/posts/example.json"></script>');
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /must not request article JSON/
    );
  });
});

test('script sources accept legal attribute forms and normalize every local route form', () => {
  // Break caught: a quoted-only parser misses a shipped module, or query/hash and route resolution bypass the allowlist.
  const html = [
    '<script type="application/ld+json">{"@type":"BlogPosting"}</script>',
    '<script src="../assets/js/theme.js?cache=1#ready"></script>',
    "<script defer src='../assets/js/site-shell.js?cache=2#ready'></script>",
    '<script data-role=page src=../assets/js/home-page.js></script>',
    '<script src=/assets/js/content-cards.js?cache=3#ready></script>',
  ].join('');

  assert.deepEqual(scriptSources('posts/example.html', html), [
    'assets/js/theme.js',
    'assets/js/site-shell.js',
    'assets/js/home-page.js',
    'assets/js/content-cards.js',
  ]);
});

test('unquoted forbidden Home modules are rejected by the published script gate', () => {
  // Break caught: unquoted SearchCore or ArticlePage escapes the Home dependency allowlist.
  withFixture(({ fixtureArticleRoute, fixtureRoutes, publicDir }) => {
    fs.appendFileSync(
      path.join(publicDir, 'index.html'),
      '<script defer src=assets/js/search-core.js></script>'
    );
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /assets\/js\/search-core\.js/
    );

    fs.writeFileSync(
      path.join(publicDir, 'index.html'),
      '<script src="assets/js/theme.js"></script><script src="assets/js/site-shell.js"></script><script src="assets/js/home-page.js"></script><script src=assets/js/article-page.js></script>'
    );
    assert.throws(
      () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
      /assets\/js\/article-page\.js/
    );
  });
});

test('the fixed-seed search-index overflow fixture is repeatable and genuinely exceeds gzip budget', () => {
  // Break caught: random fixture bytes make the gzip RED proof nondeterministic or accidentally compress below the limit.
  const first = deterministicIncompressibleBytes(SEARCH_INDEX_GZIP_LIMIT_BYTES + 1, 0x1a2b3c4d);
  const second = deterministicIncompressibleBytes(SEARCH_INDEX_GZIP_LIMIT_BYTES + 1, 0x1a2b3c4d);
  const firstGzip = zlib.gzipSync(first);
  const secondGzip = zlib.gzipSync(second);

  assert.deepEqual(first, second);
  assert.deepEqual(firstGzip, secondGzip);
  assert.ok(firstGzip.length > SEARCH_INDEX_GZIP_LIMIT_BYTES);
});

test('script scanner reads real src attributes without treating quoted markup or raw-text bodies as tags', () => {
  // Break caught: attribute substrings, quoted >, or inline script text bypasses or invents a dependency.
  const html = [
    '<script data-src=assets/js/home-page.js src=assets/js/search-core.js></script>',
    '<script data-note="value src=assets/js/home-page.js" src=assets/js/article-page.js></script>',
    '<script data-note="a>b" src=assets/js/search-core.js></script>',
    '<script>const sample = "<script src=assets/js/article-page.js>";</script>',
    '<ScRiPt\n  DeFeR\tSrC = assets/js/search-core.js\t></ScRiPt>',
  ].join('');

  assert.deepEqual(scriptSources('index.html', html), [
    'assets/js/search-core.js',
    'assets/js/article-page.js',
    'assets/js/search-core.js',
    'assets/js/search-core.js',
  ]);
});

test('real forbidden Home src attributes fail the allowlist regardless of other attributes or casing', () => {
  // Break caught: a genuine forbidden module is hidden behind a data-src, quoted value, quoted >, or mixed-case tag.
  const forbiddenTags = [
    '<script data-src=assets/js/home-page.js src=assets/js/search-core.js></script>',
    '<script data-note="value src=assets/js/home-page.js" src=assets/js/article-page.js></script>',
    '<script data-note="a>b" src=assets/js/search-core.js></script>',
    '<ScRiPt\n  DeFeR\tSrC = assets/js/article-page.js\t></ScRiPt>',
  ];

  for (const forbiddenTag of forbiddenTags) {
    withFixture(({ fixtureArticleRoute, fixtureRoutes, publicDir }) => {
      fs.appendFileSync(path.join(publicDir, 'index.html'), forbiddenTag);
      assert.throws(
        () => assertPublishedArtifacts(publicDir, fixtureRoutes, fixtureArticleRoute),
        /assets\/js\/(?:search-core|article-page)\.js/
      );
    });
  }
});
