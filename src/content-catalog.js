'use strict';

const fs = require('fs');
const { foldContentId, isPortableContentId } = require('./content-id');

/**
 * Read the generated post index without evaluating JavaScript.
 *
 * @param {string} filename generated public/assets/js/posts-index.js
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
  const foldedIds = new Map();
  for (const post of posts) {
    const id = post && post.id;
    if (!isPortableContentId(id)) {
      throw new Error(`Invalid content id in generated catalog: ${String(id)}`);
    }
    const foldedId = foldContentId(id);
    if (foldedIds.has(foldedId)) {
      const existingId = foldedIds.get(foldedId);
      if (existingId === id) {
        throw new Error(`Duplicate content id in generated catalog: ${id}`);
      }
      throw new Error(
        `Duplicate content id after case folding: ${existingId} conflicts with ${id}`
      );
    }
    foldedIds.set(foldedId, id);
    ids.add(id);
  }
  return ids;
}

module.exports = { loadContentIds };
