'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const LegacyPost = require('../public/assets/js/legacy-post.js');

test('resolves only a portable ID that exists exactly in the published index', () => {
  assert.equal(LegacyPost.resolveTarget(globalThis, 'alpha', ['alpha']), 'posts/alpha.html');
  assert.equal(LegacyPost.resolveTarget(globalThis, 'Alpha', ['alpha']), null);
});

test('rejects invalid legacy article IDs', () => {
  assert.equal(LegacyPost.resolveTarget(globalThis, '../alpha', ['alpha']), null);
  assert.equal(LegacyPost.resolveTarget(globalThis, 'CON', ['CON']), null);
});

test('rejects legacy article IDs absent from the published index', () => {
  assert.equal(LegacyPost.resolveTarget(globalThis, 'missing', ['alpha']), null);
});

test('redirects only validated published IDs and keeps an invalid URL recoverable', () => {
  const redirects = [];
  const status = { innerHTML: '' };
  const root = {
    POSTS: [{ id: 'alpha' }],
    document: {
      getElementById(id) {
        return id === 'legacy-post-status' ? status : null;
      }
    },
    location: {
      search: '?id=../alpha',
      replace(target) {
        redirects.push(target);
      }
    }
  };

  assert.equal(LegacyPost.redirect(root), null);
  assert.deepEqual(redirects, []);
  assert.match(status.innerHTML, /文章不存在/);
  assert.match(status.innerHTML, /href="index\.html"/);
});
