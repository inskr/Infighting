'use strict';

const fs = require('fs');
const path = require('path');
const {
  foldContentId,
  isPortableContentId,
  isValidContentId,
} = require('../src/content-id');
const { renderArticlePage } = require('./article-template');
const { renderRss, renderSitemap } = require('./discovery-output');

const MANAGED_OUTPUTS = [
  { relativePath: 'posts', staged: true },
  { relativePath: path.join('assets', 'posts'), staged: true },
  { relativePath: path.join('assets', 'js', 'posts-index.js'), staged: true },
  { relativePath: 'sitemap.xml', staged: true },
  { relativePath: 'rss.xml', staged: true },
  { relativePath: path.join('assets', 'js', 'posts-data.js'), staged: false },
];

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (!field) return;

    let value = field[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    meta[field[1]] = value;
  });

  return { meta, content: match[2] };
}

function readAndValidatePosts(postsDir) {
  const posts = fs
    .readdirSync(postsDir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
      const { meta, content } = parseFrontmatter(raw);
      return {
        id: meta.id || file.replace(/\.md$/, ''),
        title: meta.title || '未命名',
        date: meta.date || '1970-01-01',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        summary: meta.summary || '',
        type: meta.type || 'post',
        content: content.trim(),
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

  const seenIds = new Map();
  for (const post of posts) {
    if (!isValidContentId(post.id)) {
      throw new Error(
        "Invalid post id '" +
          post.id +
          "'. Use 1-128 ASCII letters, numbers, underscores, or hyphens."
      );
    }
    if (!isPortableContentId(post.id)) {
      throw new Error(
        "Invalid post id '" +
          post.id +
          "'. IDs must be portable filenames and cannot use Windows-reserved basenames."
      );
    }
    const foldedId = foldContentId(post.id);
    if (seenIds.has(foldedId)) {
      const existingId = seenIds.get(foldedId);
      if (existingId === post.id) {
        throw new Error('Duplicate post id: ' + post.id);
      }
      throw new Error(
        'Duplicate post id after case folding: ' + existingId + ' conflicts with ' + post.id
      );
    }
    seenIds.set(foldedId, post.id);
  }

  return posts;
}

function writePostIndex(publicDir, posts) {
  const index = posts.map(({ content, ...entry }) => entry);
  const outIndexFile = path.join(publicDir, 'assets', 'js', 'posts-index.js');

  fs.mkdirSync(path.dirname(outIndexFile), { recursive: true });
  fs.writeFileSync(
    outIndexFile,
    `// Auto-generated.\nwindow.POSTS = ${JSON.stringify(index, null, 2)};\n`,
    'utf8'
  );
  fs.rmSync(path.join(publicDir, 'assets', 'js', 'posts-data.js'), { force: true });
}

function writeCompatibilityDocuments(publicDir, posts) {
  const outPostsDir = path.join(publicDir, 'assets', 'posts');

  fs.rmSync(outPostsDir, { recursive: true, force: true });
  fs.mkdirSync(outPostsDir, { recursive: true });
  for (const post of posts) {
    fs.writeFileSync(path.join(outPostsDir, `${post.id}.json`), JSON.stringify(post), 'utf8');
  }
}

function writeArticlePages(publicDir, posts, siteUrl, renderArticle = renderArticlePage) {
  const outArticlesDir = path.join(publicDir, 'posts');

  fs.rmSync(outArticlesDir, { recursive: true, force: true });
  fs.mkdirSync(outArticlesDir, { recursive: true });
  for (const post of posts) {
    fs.writeFileSync(
      path.join(outArticlesDir, `${post.id}.html`),
      renderArticle({ post, posts, siteUrl }),
      'utf8'
    );
  }
}

function writeDiscoveryOutputs(publicDir, posts, siteUrl) {
  fs.writeFileSync(
    path.join(publicDir, 'sitemap.xml'),
    renderSitemap({ posts, siteUrl }),
    'utf8'
  );
  fs.writeFileSync(path.join(publicDir, 'rss.xml'), renderRss({ posts, siteUrl }), 'utf8');
}

function directFileNames(directory, extension) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

function expectFileNames(directory, extension, expectedNames) {
  const actualNames = directFileNames(directory, extension);
  const expected = [...expectedNames].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expected)) {
    throw new Error(
      `Invalid staged ${extension} outputs: expected ${expected.length}, found ${actualNames.length}`
    );
  }
}

function parsePostIndex(source) {
  const prefix = '// Auto-generated.\nwindow.POSTS = ';
  const suffix = ';\n';
  if (!source.startsWith(prefix) || !source.endsWith(suffix)) {
    throw new Error('Invalid staged post index wrapper');
  }
  return JSON.parse(source.slice(prefix.length, -suffix.length));
}

function parseXmlDocument(source) {
  const stack = [];
  let rootName;
  let rootCount = 0;
  let cursor = 0;
  const tokenPattern = /<[^>]+>/g;
  let match;

  while ((match = tokenPattern.exec(source)) !== null) {
    if (/[<>]/.test(source.slice(cursor, match.index))) {
      throw new Error('Malformed XML text');
    }
    cursor = tokenPattern.lastIndex;
    const token = match[0];
    if (token.startsWith('<?') || token.startsWith('<!--')) continue;

    const closing = token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);
    if (closing) {
      if (stack.pop() !== closing[1]) throw new Error('Mismatched XML element');
      continue;
    }

    const opening = token.match(/^<([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?\s*\/?>$/);
    if (!opening) throw new Error('Malformed XML element');
    if (stack.length === 0) {
      rootCount += 1;
      rootName = opening[1];
    }
    if (!token.endsWith('/>')) stack.push(opening[1]);
  }

  if (/[<>]/.test(source.slice(cursor)) || stack.length !== 0 || rootCount !== 1) {
    throw new Error('Malformed XML document');
  }
  return { rootName };
}

function validateStagedOutputs(stagedPublicDir, posts) {
  const articleNames = posts.map((post) => `${post.id}.html`);
  const jsonNames = posts.map((post) => `${post.id}.json`);
  const stagedArticlesDir = path.join(stagedPublicDir, 'posts');
  const stagedJsonDir = path.join(stagedPublicDir, 'assets', 'posts');

  expectFileNames(stagedArticlesDir, '.html', articleNames);
  expectFileNames(stagedJsonDir, '.json', jsonNames);

  for (const post of posts) {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(stagedJsonDir, `${post.id}.json`), 'utf8')
    );
    if (parsed.id !== post.id) throw new Error(`Invalid staged article JSON for ${post.id}`);
  }

  const index = parsePostIndex(
    fs.readFileSync(path.join(stagedPublicDir, 'assets', 'js', 'posts-index.js'), 'utf8')
  );
  if (!Array.isArray(index) || index.length !== posts.length) {
    throw new Error('Invalid staged post index count');
  }

  const sitemap = parseXmlDocument(
    fs.readFileSync(path.join(stagedPublicDir, 'sitemap.xml'), 'utf8')
  );
  const rss = parseXmlDocument(fs.readFileSync(path.join(stagedPublicDir, 'rss.xml'), 'utf8'));
  if (sitemap.rootName !== 'urlset' || rss.rootName !== 'rss') {
    throw new Error('Invalid staged discovery document root');
  }
}

function readPublishedPostIds(publicDir) {
  const indexFile = path.join(publicDir, 'assets', 'js', 'posts-index.js');
  if (!fs.existsSync(indexFile)) return [];

  try {
    const index = parsePostIndex(fs.readFileSync(indexFile, 'utf8'));
    if (!Array.isArray(index)) return [];
    return index
      .map((entry) => entry && entry.id)
      .filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
}

function copyUnmanagedEntries(sourceDir, targetDir, managedNames) {
  if (!fs.existsSync(sourceDir)) return;

  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (managedNames.has(entry.name)) continue;
    fs.cpSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name), {
      errorOnExist: true,
      force: false,
      recursive: entry.isDirectory(),
    });
  }
}

function preserveUnmanagedEntries(stagedPublicDir, publicDir, posts) {
  const managedIds = new Set([
    ...readPublishedPostIds(publicDir),
    ...posts.map((post) => post.id),
  ]);
  const articleNames = new Set([...managedIds].map((id) => `${id}.html`));
  const jsonNames = new Set([...managedIds].map((id) => `${id}.json`));

  copyUnmanagedEntries(
    path.join(publicDir, 'posts'),
    path.join(stagedPublicDir, 'posts'),
    articleNames
  );
  copyUnmanagedEntries(
    path.join(publicDir, 'assets', 'posts'),
    path.join(stagedPublicDir, 'assets', 'posts'),
    jsonNames
  );
}

function replaceManagedOutputs(stagedPublicDir, publicDir, backupDir) {
  const operations = [];

  try {
    for (const output of MANAGED_OUTPUTS) {
      const livePath = path.join(publicDir, output.relativePath);
      const backupPath = path.join(backupDir, output.relativePath);
      const stagedPath = path.join(stagedPublicDir, output.relativePath);
      const operation = {
        backupPath,
        hadExisting: fs.existsSync(livePath),
        installed: false,
        livePath,
      };
      operations.push(operation);

      if (operation.hadExisting) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.renameSync(livePath, backupPath);
      }
      if (output.staged) {
        fs.mkdirSync(path.dirname(livePath), { recursive: true });
        fs.renameSync(stagedPath, livePath);
        operation.installed = true;
      }
    }
  } catch (error) {
    for (const operation of operations.reverse()) {
      if (operation.installed) {
        fs.rmSync(operation.livePath, { recursive: true, force: true });
      }
      if (operation.hadExisting && fs.existsSync(operation.backupPath)) {
        fs.mkdirSync(path.dirname(operation.livePath), { recursive: true });
        fs.renameSync(operation.backupPath, operation.livePath);
      }
    }
    throw error;
  }
}

function buildSite({ postsDir, publicDir, siteUrl, renderArticle = renderArticlePage }) {
  const posts = readAndValidatePosts(postsDir);
  const resolvedPublicDir = path.resolve(publicDir);
  const publicParent = path.dirname(resolvedPublicDir);
  fs.mkdirSync(publicParent, { recursive: true });
  const stageDir = fs.mkdtempSync(
    path.join(publicParent, `.${path.basename(resolvedPublicDir)}-publish-`)
  );
  const stagedPublicDir = path.join(stageDir, 'next');
  const backupDir = path.join(stageDir, 'previous');

  try {
    writePostIndex(stagedPublicDir, posts);
    writeCompatibilityDocuments(stagedPublicDir, posts);
    writeArticlePages(stagedPublicDir, posts, siteUrl, renderArticle);
    writeDiscoveryOutputs(stagedPublicDir, posts, siteUrl);
    validateStagedOutputs(stagedPublicDir, posts);
    preserveUnmanagedEntries(stagedPublicDir, resolvedPublicDir, posts);
    replaceManagedOutputs(stagedPublicDir, resolvedPublicDir, backupDir);
    return posts.map(({ content, ...entry }) => entry);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

module.exports = {
  buildSite,
  parseFrontmatter,
  readAndValidatePosts,
  writeArticlePages,
  writeCompatibilityDocuments,
  writeDiscoveryOutputs,
  writePostIndex,
};
