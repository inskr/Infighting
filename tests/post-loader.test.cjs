'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PostLoader = require('../public/assets/js/post-loader.js');

function fullPost(id = 'alpha') {
  return {
    id,
    title: 'Alpha',
    date: '2026-08-11',
    tags: [],
    summary: '',
    type: 'post',
    content: '# Body'
  };
}

test('accepts only safe generated post IDs', () => {
  assert.equal(PostLoader.isValidPostId('alpha'), true);
  assert.equal(PostLoader.isValidPostId('A_1-2'), true);
  assert.equal(PostLoader.isValidPostId('a'.repeat(128)), true);

  for (const id of [
    '',
    '../secret',
    'alpha/beta',
    '.hidden',
    '文章',
    'CON',
    'prn',
    'Aux',
    'NUL',
    'com1',
    'COM9',
    'lpt1',
    'LPT9',
    'a'.repeat(129),
    null
  ]) {
    assert.equal(PostLoader.isValidPostId(id), false, String(id));
  }
});

test('loads only the validated article JSON path', async () => {
  const calls = [];
  const root = {
    fetch: async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => fullPost('alpha')
      };
    }
  };

  const post = await PostLoader.loadPost(root, 'alpha');

  assert.equal(post.id, 'alpha');
  assert.deepEqual(calls, ['assets/posts/alpha.json']);
});

test('rejects invalid IDs before fetching', async () => {
  await assert.rejects(
    () => PostLoader.loadPost({ fetch() { throw new Error('must not fetch'); } }, '../secret'),
    { code: 'INVALID_ID' }
  );
});

test('classifies a missing article separately from other HTTP failures', async () => {
  await assert.rejects(
    () => PostLoader.loadPost({ fetch: async () => ({ ok: false, status: 404 }) }, 'missing'),
    { code: 'NOT_FOUND' }
  );
  await assert.rejects(
    () => PostLoader.loadPost({ fetch: async () => ({ ok: false, status: 503 }) }, 'alpha'),
    { code: 'LOAD_FAILED' }
  );
});

test('classifies network and JSON parse failures as load failures', async () => {
  await assert.rejects(
    () => PostLoader.loadPost({ fetch: async () => { throw new Error('offline'); } }, 'alpha'),
    { code: 'LOAD_FAILED' }
  );
  await assert.rejects(
    () => PostLoader.loadPost({
      fetch: async () => ({
        ok: true,
        json: async () => { throw new SyntaxError('bad JSON'); }
      })
    }, 'alpha'),
    { code: 'LOAD_FAILED' }
  );
});

test('rejects article documents whose ID does not match the requested ID', async () => {
  await assert.rejects(
    () => PostLoader.loadPost({
      fetch: async () => ({
        ok: true,
        json: async () => ({
          id: 'beta',
          title: 'Alpha',
          date: '2026-08-11',
          tags: [],
          summary: '',
          type: 'post',
          content: '# Body'
        })
      })
    }, 'alpha'),
    { code: 'LOAD_FAILED' }
  );
});

test('rejects article documents without the generated post schema', async () => {
  const invalidDocuments = [
    null,
    [],
    { ...fullPost(), title: '' },
    { ...fullPost(), date: null },
    { ...fullPost(), date: '' },
    { ...fullPost(), tags: 'testing' },
    { ...fullPost(), tags: ['testing', 42] },
    { ...fullPost(), summary: null },
    { ...fullPost(), type: null },
    { ...fullPost(), type: '' },
    { ...fullPost(), content: null }
  ];

  for (const document of invalidDocuments) {
    await assert.rejects(
      () => PostLoader.loadPost({
        fetch: async () => ({ ok: true, json: async () => document })
      }, 'alpha'),
      { code: 'LOAD_FAILED' }
    );
  }
});
