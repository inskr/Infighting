'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../src/app');
const { createStatsStore } = require('../src/db');

test('concurrent view and like requests do not lose updates', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'infighting-concurrency-'));
  const statsStore = createStatsStore({ filename: path.join(tempDir, 'stats.db') });
  const app = createApp({
    statsStore,
    contentIds: new Set(['concurrent-post']),
    publicDir: path.join(__dirname, '..', 'public'),
    logger: { error() {} },
    mutationLimit: 200
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

  const postMany = (action) =>
    Promise.all(
      Array.from({ length: 100 }, () =>
        fetch(`${baseUrl}/api/content/concurrent-post/${action}`, { method: 'POST' })
      )
    );

  const [viewResponses, likeResponses] = await Promise.all([
    postMany('view'),
    postMany('like')
  ]);
  assert.ok(viewResponses.every((response) => response.status === 200));
  assert.ok(likeResponses.every((response) => response.status === 200));

  const response = await fetch(`${baseUrl}/api/content/concurrent-post/stats`);
  const result = await response.json();
  assert.deepEqual(result.data, { viewCount: 100, likeCount: 100 });
});
