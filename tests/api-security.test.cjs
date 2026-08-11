'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../src/app');
const { createStatsStore } = require('../src/db');

test('statistics API validates catalog IDs, limits mutations, and sets security headers', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'infighting-api-'));
  const databaseFile = path.join(tempDir, 'stats.db');
  const statsStore = createStatsStore({ filename: databaseFile });
  const app = createApp({
    statsStore,
    contentIds: new Set(['known-post']),
    publicDir: path.join(__dirname, '..', 'public'),
    logger: { error() {} },
    mutationLimit: 2
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    statsStore.close();
    for (const entry of fs.readdirSync(tempDir)) {
      fs.unlinkSync(path.join(tempDir, entry));
    }
    fs.rmdirSync(tempDir);
  });

  const invalid = await fetch(`${baseUrl}/api/content/%20/like`, { method: 'POST' });
  assert.equal(invalid.status, 400);

  const reserved = await fetch(`${baseUrl}/api/content/CON/like`, { method: 'POST' });
  assert.equal(reserved.status, 400);

  const unknown = await fetch(`${baseUrl}/api/content/not-published/like`, {
    method: 'POST'
  });
  assert.equal(unknown.status, 404);

  const first = await fetch(`${baseUrl}/api/content/known-post/like`, {
    method: 'POST'
  });
  const second = await fetch(`${baseUrl}/api/content/known-post/like`, {
    method: 'POST'
  });
  const limited = await fetch(`${baseUrl}/api/content/known-post/like`, {
    method: 'POST'
  });
  assert.equal((await first.json()).data.likeCount, 1);
  assert.equal((await second.json()).data.likeCount, 2);
  assert.equal(limited.status, 429);

  const index = await fetch(baseUrl);
  assert.equal(index.status, 200);
  assert.equal(index.headers.get('x-powered-by'), null);
  assert.match(index.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
});
