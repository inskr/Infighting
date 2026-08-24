'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildPosts, buildSite } = require('../scripts/build-posts');
const { renderArticlePage } = require('../scripts/article-template');
const { loadContentIds } = require('../src/content-catalog');
const { seedStaticArticleTargets } = require('./helpers/publishing-fixture.cjs');

const SITE_URL = 'https://inskr.github.io/Infighting/';

function writePost(postsDir, filename, fields = {}) {
  const id = fields.id ?? filename.replace(/\.md$/, '');
  const title = fields.title ?? id;
  const dateLine = fields.date === null ? '' : `date: ${fields.date ?? '2026-08-11'}\n`;
  fs.writeFileSync(
    path.join(postsDir, filename),
    '---\n' +
      `id: ${id}\n` +
      `title: ${title}\n` +
      dateLine +
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

function snapshotFiles(directory) {
  const snapshot = new Map();
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        snapshot.set(path.relative(directory, absolutePath), fs.readFileSync(absolutePath));
      }
    }
  };
  if (fs.existsSync(directory)) visit(directory);
  return snapshot;
}

function assertSnapshotsEqual(actual, expected) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort());
  for (const [relativePath, bytes] of expected) {
    assert.deepEqual(actual.get(relativePath), bytes, relativePath);
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

test('requires an explicit canonical real calendar date for every publishable article', () => {
  withPaths((paths) => {
    for (const date of [null, '2026-8-01', '2026-02-30', '2025-02-29']) {
      writePost(paths.postsDir, 'alpha.md', { date });
      assert.throws(
        () => buildPosts(paths),
        /Invalid post date.*YYYY-MM-DD.*real calendar date/i,
        String(date)
      );
    }
  });
});

test('date validation failure preserves the previous publication byte for byte', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-invalid-date-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    writePost(postsDir, 'alpha.md');
    seedStaticArticleTargets(publicDir);
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf8');
    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const before = snapshotFiles(publicDir);

    writePost(postsDir, 'alpha.md', { date: '2026-02-30' });
    assert.throws(
      () => buildSite({ postsDir, publicDir, siteUrl: SITE_URL }),
      /Invalid post date/
    );

    assertSnapshotsEqual(snapshotFiles(publicDir), before);
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith('.public-publish-')),
      []
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('broken generated internal targets fail before replacing the previous publication', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-broken-link-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    seedStaticArticleTargets(publicDir);
    writePost(postsDir, 'alpha.md');
    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const before = snapshotFiles(publicDir);

    fs.writeFileSync(
      path.join(postsDir, 'beta.md'),
      '---\nid: beta\ntitle: Beta\ndate: 2026-08-12\ntags: [testing]\n' +
        'summary: Broken fixture\ntype: post\n---\n[missing](../missing.html)\n',
      'utf8'
    );
    assert.throws(
      () => buildSite({ postsDir, publicDir, siteUrl: SITE_URL }),
      /Broken internal href.*beta\.html.*missing\.html/i
    );

    fs.writeFileSync(
      path.join(postsDir, 'beta.md'),
      '---\nid: beta\ntitle: Beta\ndate: 2026-08-12\ntags: [testing]\n' +
        'summary: Broken fixture\ntype: post\n---\n![missing](../missing.png)\n',
      'utf8'
    );
    assert.throws(
      () => buildSite({ postsDir, publicDir, siteUrl: SITE_URL }),
      /Broken internal src.*beta\.html.*missing\.png/i
    );

    assertSnapshotsEqual(snapshotFiles(publicDir), before);
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith('.public-publish-')),
      []
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a staged article cannot rely on a generated route being retired by the same publication', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-retired-route-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    seedStaticArticleTargets(publicDir);
    writePost(postsDir, 'alpha.md');
    writePost(postsDir, 'beta.md', { date: '2026-08-10' });
    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const before = snapshotFiles(publicDir);

    fs.rmSync(path.join(postsDir, 'beta.md'));
    fs.writeFileSync(
      path.join(postsDir, 'alpha.md'),
      '---\nid: alpha\ntitle: Alpha\ndate: 2026-08-11\ntags: [testing]\n' +
        'summary: Fixture post\ntype: post\n---\n[retired](../posts/beta.html)\n',
      'utf8'
    );
    assert.throws(
      () => buildSite({ postsDir, publicDir, siteUrl: SITE_URL }),
      /Broken internal href.*beta\.html/i
    );

    assertSnapshotsEqual(snapshotFiles(publicDir), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('keeps every managed output unchanged when an article render fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-publisher-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');
  const handAuthoredFile = path.join(publicDir, 'robots.txt');
  const managedFiles = [
    path.join('posts', 'alpha.html'),
    path.join('assets', 'posts', 'alpha.json'),
    path.join('assets', 'js', 'posts-index.js'),
    'sitemap.xml',
    'rss.xml',
  ];

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    seedStaticArticleTargets(publicDir);
    writePost(postsDir, 'alpha.md');
    fs.writeFileSync(handAuthoredFile, 'User-agent: *\nAllow: /\n', 'utf8');

    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const before = new Map(
      managedFiles.map((relativePath) => [
        relativePath,
        fs.readFileSync(path.join(publicDir, relativePath)),
      ])
    );

    writePost(postsDir, 'beta.md', { date: '2026-08-12' });
    assert.throws(
      () =>
        buildSite({
          postsDir,
          publicDir,
          siteUrl: SITE_URL,
          renderArticle(options) {
            if (options.post.id === 'beta') throw new Error('fixture render failure');
            return renderArticlePage(options);
          },
        }),
      /fixture render failure/
    );

    for (const [relativePath, expected] of before) {
      assert.deepEqual(fs.readFileSync(path.join(publicDir, relativePath)), expected, relativePath);
    }
    assert.equal(fs.existsSync(path.join(publicDir, 'posts', 'beta.html')), false);
    assert.equal(fs.existsSync(path.join(publicDir, 'assets', 'posts', 'beta.json')), false);
    assert.equal(fs.readFileSync(handAuthoredFile, 'utf8'), 'User-agent: *\nAllow: /\n');
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith('.public-publish-')),
      []
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('replacement failure after live paths move restores managed and unrelated outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-replacement-rollback-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');
  const originalRename = fs.renameSync;
  let movedLivePaths = 0;
  let injected = false;

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    seedStaticArticleTargets(publicDir);
    writePost(postsDir, 'alpha.md');
    fs.writeFileSync(path.join(publicDir, 'unrelated.txt'), 'keep me', 'utf8');
    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
    const before = snapshotFiles(publicDir);

    writePost(postsDir, 'beta.md', { date: '2026-08-12' });
    const secondManagedLivePath = path.resolve(publicDir, 'assets', 'posts');
    fs.renameSync = function injectedRename(source, target) {
      const result = originalRename.call(fs, source, target);
      const resolvedSource = path.resolve(source);
      const resolvedTarget = path.resolve(target);
      if (
        resolvedSource.startsWith(path.resolve(publicDir) + path.sep) &&
        resolvedTarget.includes(path.sep + 'previous' + path.sep)
      ) {
        movedLivePaths += 1;
      }
      if (!injected && resolvedSource === secondManagedLivePath) {
        injected = true;
        throw new Error('fixture replacement failure after move');
      }
      return result;
    };

    assert.throws(
      () => buildSite({ postsDir, publicDir, siteUrl: SITE_URL }),
      /fixture replacement failure after move/
    );
    assert.equal(injected, true);
    assert.ok(movedLivePaths >= 2, 'fault must occur after an earlier live managed move');
    assertSnapshotsEqual(snapshotFiles(publicDir), before);
    assert.deepEqual(
      fs.readdirSync(root).filter((name) => name.startsWith('.public-publish-')),
      []
    );
  } finally {
    fs.renameSync = originalRename;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('successful publication preserves entries not owned by the generated post catalogs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publisher-sentinels-'));
  const postsDir = path.join(root, 'posts');
  const publicDir = path.join(root, 'public');
  const sentinels = new Map([
    [path.join('posts', 'README.txt'), 'hand-authored article notes'],
    [path.join('posts', 'hand-authored.html'), '<p>hand-authored article page</p>'],
    [path.join('posts', 'manual', 'guide.html'), '<p>hand-authored guide</p>'],
    [path.join('assets', 'posts', 'hand-authored.dat'), 'hand-authored article data'],
    [path.join('assets', 'posts', 'hand-authored.json'), '{"owner":"human"}'],
    [path.join('assets', 'posts', 'manual', 'metadata.json'), '{"owner":"human"}'],
  ]);

  try {
    fs.mkdirSync(postsDir, { recursive: true });
    writePost(postsDir, 'alpha.md');
    seedStaticArticleTargets(publicDir);
    for (const [relativePath, content] of sentinels) {
      const target = path.join(publicDir, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }

    buildSite({ postsDir, publicDir, siteUrl: SITE_URL });

    assert.equal(fs.existsSync(path.join(publicDir, 'posts', 'alpha.html')), true);
    assert.equal(fs.existsSync(path.join(publicDir, 'assets', 'posts', 'alpha.json')), true);
    for (const [relativePath, content] of sentinels) {
      assert.equal(fs.readFileSync(path.join(publicDir, relativePath), 'utf8'), content);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('configured full suite includes every Phase 1 publishing contract test', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  const configuredCommands = new Set(packageJson.scripts.test.split(/\s+/));

  for (const testFile of [
    'tests/article-page.test.cjs',
    'tests/discovery-output.test.cjs',
    'tests/seo-output.test.cjs',
    'tests/legacy-post.test.cjs',
  ]) {
    assert.equal(configuredCommands.has(testFile), true, testFile);
  }
});
