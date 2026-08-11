'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildPosts } = require('../scripts/build-posts');
const { loadContentIds } = require('../src/content-catalog');

function writePost(postsDir, filename, fields = {}) {
  const id = fields.id ?? filename.replace(/\.md$/, '');
  const title = fields.title ?? id;
  const date = fields.date ?? '2026-08-11';
  fs.writeFileSync(
    path.join(postsDir, filename),
    '---\n' +
      `id: ${id}\n` +
      `title: ${title}\n` +
      `date: ${date}\n` +
      'tags: [testing]\n' +
      'summary: Fixture post\n' +
      'type: post\n' +
      '---\n' +
      '# Body\n',
    'utf8'
  );
}

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

test('rejects post IDs outside the documented syntax boundary', () => {
  withPaths((paths) => {
    writePost(paths.postsDir, 'alpha.md', { id: '../secret' });

    assert.throws(
      () => buildPosts(paths),
      /Invalid post id '\.\.\/secret'/
    );
  });
});

test('rejects exact duplicate post IDs before writing outputs', () => {
  withPaths((paths) => {
    writePost(paths.postsDir, 'beta.md', { id: 'alpha' });

    assert.throws(() => buildPosts(paths), /Duplicate post id: alpha/);
  });
});

test('rejects post IDs that collide after ASCII case folding', () => {
  withPaths((paths) => {
    writePost(paths.postsDir, 'beta.md', { id: 'Alpha' });

    assert.throws(() => buildPosts(paths), /Duplicate post id.*Alpha.*alpha/i);
  });
});

test('rejects Windows-reserved post basenames even when their syntax is valid', () => {
  withPaths((paths) => {
    for (const id of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9']) {
      writePost(paths.postsDir, 'alpha.md', { id });
      assert.throws(
        () => buildPosts(paths),
        /portable filename|reserved/i,
        id
      );
    }
  });
});

test('uses the post ID as a deterministic tie-breaker for equal dates', () => {
  withPaths((paths) => {
    writePost(paths.postsDir, 'beta.md', { id: 'beta', date: '2026-08-11' });

    assert.deepEqual(
      buildPosts(paths).map((post) => post.id),
      ['alpha', 'beta']
    );
  });
});

test('backend catalog applies the same portable and case-folded ID rules', () => {
  withPaths((paths) => {
    const writeCatalog = (ids) => {
      fs.writeFileSync(
        paths.outIndexFile,
        `window.POSTS = ${JSON.stringify(ids.map((id) => ({ id })))};\n`,
        'utf8'
      );
    };

    writeCatalog(['alpha', 'alpha']);
    assert.throws(
      () => loadContentIds(paths.outIndexFile),
      /Duplicate content id in generated catalog: alpha/
    );

    writeCatalog(['alpha', 'Alpha']);
    assert.throws(
      () => loadContentIds(paths.outIndexFile),
      /Duplicate content id.*Alpha.*alpha/i
    );

    writeCatalog(['CON']);
    assert.throws(
      () => loadContentIds(paths.outIndexFile),
      /Invalid content id.*CON/i
    );

    writeCatalog(['../secret']);
    assert.throws(
      () => loadContentIds(paths.outIndexFile),
      /Invalid content id.*\.\.\/secret/i
    );
  });
});
