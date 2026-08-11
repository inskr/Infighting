'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../src/app');

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
    ['/assets/js/main.js', 'public, max-age=604800, must-revalidate'],
    ['/index.html', 'public, max-age=3600, must-revalidate'],
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
