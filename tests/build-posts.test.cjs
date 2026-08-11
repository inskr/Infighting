'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildPosts } = require('../scripts/build-posts');

function createPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-posts-'));
  const postsDir = path.join(root, 'posts');
  const outPostsDir = path.join(root, 'output', 'posts');
  const paths = {
    postsDir,
    outIndexFile: path.join(root, 'output', 'js', 'posts-index.js'),
    outPostsDir,
    legacyFile: path.join(root, 'output', 'js', 'posts-data.js'),
  };

  fs.mkdirSync(postsDir, { recursive: true });
  fs.writeFileSync(
    path.join(postsDir, 'alpha.md'),
    '---\n' +
      'id: alpha\n' +
      'title: Alpha\n' +
      'date: 2026-08-11\n' +
      'tags: [testing]\n' +
      'summary: First post\n' +
      'type: post\n' +
      '---\n' +
      '# Body\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(postsDir, 'beta.md'),
    '---\n' +
      'id: beta\n' +
      'title: Beta\n' +
      'date: 2026-08-10\n' +
      '---\n' +
      '# Other body\n',
    'utf8'
  );
  fs.mkdirSync(outPostsDir, { recursive: true });
  fs.writeFileSync(path.join(outPostsDir, 'stale.json'), '{}', 'utf8');
  fs.mkdirSync(path.dirname(paths.legacyFile), { recursive: true });
  fs.writeFileSync(paths.legacyFile, 'legacy', 'utf8');

  return { root, paths };
}

function withPaths(callback) {
  const { root, paths } = createPaths();
  try {
    callback(paths);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('builds a metadata-only index and one JSON document per post', () => {
  withPaths((paths) => {
    const result = buildPosts(paths);
    const indexSource = fs.readFileSync(paths.outIndexFile, 'utf8');
    const article = JSON.parse(
      fs.readFileSync(path.join(paths.outPostsDir, 'alpha.json'), 'utf8')
    );

    assert.equal(result[0].content, undefined);
    assert.doesNotMatch(indexSource, /"content"/);
    assert.equal(article.id, 'alpha');
    assert.equal(article.content, '# Body');
  });
});

test('removes the legacy aggregate and stale article JSON files', () => {
  withPaths((paths) => {
    buildPosts(paths);

    assert.equal(fs.existsSync(paths.legacyFile), false);
    assert.equal(fs.existsSync(path.join(paths.outPostsDir, 'stale.json')), false);
  });
});
