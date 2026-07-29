'use strict';

const fs = require('fs');
const { isValidContentId } = require('./content-id');

/**
 * Read the generated posts data without evaluating JavaScript.
 *
 * @param {string} filename generated public/assets/js/posts-data.js
 * @returns {Set<string>}
 */
function loadContentIds(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const match = source.match(/window\.POSTS\s*=\s*([\s\S]*?);\s*$/);
  if (!match) {
    throw new Error(`Cannot read generated post catalog: ${filename}`);
  }

  const posts = JSON.parse(match[1]);
  if (!Array.isArray(posts)) {
    throw new Error(`Invalid generated post catalog: ${filename}`);
  }

  const ids = new Set();
  for (const post of posts) {
    const id = post && post.id;
    if (!isValidContentId(id)) {
      throw new Error(`Invalid content id in generated catalog: ${String(id)}`);
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate content id in generated catalog: ${id}`);
    }
    ids.add(id);
  }
  return ids;
}

module.exports = { loadContentIds };
