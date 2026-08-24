'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATIC_ARTICLE_TARGETS = [
  'favicon.svg',
  'index.html',
  'tags.html',
  'archive.html',
  path.join('assets', 'css', 'style.css'),
  path.join('assets', 'js', 'theme.js'),
  path.join('assets', 'js', 'stats.js'),
  path.join('assets', 'js', 'likes-storage.js'),
  path.join('assets', 'js', 'article-page.js'),
  path.join('vendor', 'highlight-theme.css'),
  path.join('vendor', 'highlight.min.js'),
];

function seedStaticArticleTargets(publicDir) {
  for (const relativePath of STATIC_ARTICLE_TARGETS) {
    const target = path.join(publicDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target)) fs.writeFileSync(target, `fixture: ${relativePath}\n`, 'utf8');
  }
}

module.exports = { seedStaticArticleTargets };
