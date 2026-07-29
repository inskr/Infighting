'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const modulePath = path.join(__dirname, '..', 'public', 'assets', 'js', 'stats.js');

test('backend mutation errors reject so the UI can roll back optimistic updates', async (t) => {
  global.window = { POSTS: [{ id: 'known-post' }] };
  global.fetch = async function (input) {
    const url = String(input);
    if (url === '/api/content/stats') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: {}, message: 'ok' })
      };
    }
    return {
      ok: false,
      status: 429,
      json: async () => ({ code: 1, data: null, message: 'too many requests' })
    };
  };
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  const stats = global.window.Stats;

  t.after(() => {
    delete require.cache[require.resolve(modulePath)];
    delete global.fetch;
    delete global.window;
  });

  await assert.rejects(stats.reportLike('known-post'), /too many requests/);
});
