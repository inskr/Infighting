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

function writeArticlePages(publicDir, posts, siteUrl) {
  const outArticlesDir = path.join(publicDir, 'posts');

  fs.rmSync(outArticlesDir, { recursive: true, force: true });
  fs.mkdirSync(outArticlesDir, { recursive: true });
  for (const post of posts) {
    fs.writeFileSync(
      path.join(outArticlesDir, `${post.id}.html`),
      renderArticlePage({ post, posts, siteUrl }),
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

function buildSite({ postsDir, publicDir, siteUrl }) {
  const posts = readAndValidatePosts(postsDir);
  writePostIndex(publicDir, posts);
  writeCompatibilityDocuments(publicDir, posts);
  writeArticlePages(publicDir, posts, siteUrl);
  writeDiscoveryOutputs(publicDir, posts, siteUrl);
  return posts.map(({ content, ...entry }) => entry);
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
