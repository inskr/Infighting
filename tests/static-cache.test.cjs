'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp, setStaticCacheHeaders } = require('../src/app');

test('vendor cache rule matches the published vendor directory', () => {
  const headers = new Map();
  setStaticCacheHeaders(
    {
      setHeader(name, value) {
        headers.set(name.toLowerCase(), value);
      }
    },
    path.join('site', 'public', 'vendor', 'parser.wasm')
  );

  assert.equal(
    headers.get('cache-control'),
    'public, max-age=604800, must-revalidate'
  );
});

test('serves a published vendor asset with the one-week cache policy', async () => {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-cache-'));
  const vendorDir = path.join(publicDir, 'vendor');
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.writeFileSync(path.join(vendorDir, 'parser.wasm'), Buffer.from([0, 97, 115, 109]));
  const app = createApp({
    statsStore: { getAllStats() { return Object.create(null); } },
    contentIds: new Set(),
    publicDir
  });
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/vendor/parser.wasm`);

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'public, max-age=604800, must-revalidate'
    );
    assert.ok(response.headers.get('etag'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(publicDir, { recursive: true, force: true });
  }
});

test('static resources use resource-specific cache lifetimes while APIs remain no-store', async (t) => {
  const app = createApp({
    statsStore: {
      getAllStats() {
        return Object.create(null);
      }
    },
    contentIds: new Set(),
    publicDir: path.join(__dirname, '..', 'public')
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => new Promise((resolve) => server.close(resolve)));

  const staticCases = [
    ['/assets/images/hero-ink-640.webp', 'public, max-age=604800, must-revalidate'],
    ['/assets/css/style.css', 'public, max-age=604800, must-revalidate'],
    ['/assets/js/home-page.js', 'public, max-age=604800, must-revalidate'],
    ['/assets/js/main.js', 'public, max-age=604800, must-revalidate'],
    ['/vendor/marked.min.js', 'public, max-age=604800, must-revalidate'],
    ['/index.html', 'public, max-age=3600, must-revalidate'],
    ['/posts/stm32-baremetal-scheduler.html', 'public, max-age=3600, must-revalidate'],
    ['/sitemap.xml', 'public, max-age=3600, must-revalidate'],
    ['/rss.xml', 'public, max-age=3600, must-revalidate'],
    ['/assets/js/posts-index.js', 'public, max-age=3600, must-revalidate'],
    ['/assets/js/feed-data.js', 'public, max-age=3600, must-revalidate'],
    [
      '/assets/posts/stm32-baremetal-scheduler.json',
      'public, max-age=3600, must-revalidate'
    ]
  ];

  for (const [pathname, expectedCacheControl] of staticCases) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get('cache-control'), expectedCacheControl, pathname);
    assert.ok(response.headers.get('etag'), `${pathname} should retain an ETag`);
  }

  const apiResponse = await fetch(`${baseUrl}/api/content/stats`);
  assert.equal(apiResponse.status, 200);
  assert.equal(apiResponse.headers.get('cache-control'), 'no-store');
});
