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

function scriptSources(htmlPath, html) {
  const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
  const baseUrl = new URL(`/${htmlPath}`, 'https://resource-budget.invalid');
  return scriptTags.flatMap((tag) => {
    const source = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (!source) return [];
    const relativeSource = source[1] ?? source[2] ?? source[3];
    const sourceUrl = new URL(relativeSource, baseUrl);
    return [
      sourceUrl.origin === baseUrl.origin
        ? sourceUrl.pathname.replace(/^\//, '')
        : sourceUrl.href,
    ];
  });
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
