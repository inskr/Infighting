// Build posts/*.md into a lightweight browser index and per-article documents.
// Usage: node scripts/build-posts.js
const fs = require("fs");
const path = require("path");
const { buildSite, parseFrontmatter, readAndValidatePosts } = require('./content-publisher');

const ROOT_DIR = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT_DIR, "posts");
const OUT_INDEX_FILE = path.join(ROOT_DIR, "public", "assets", "js", "posts-index.js");
const OUT_POSTS_DIR = path.join(ROOT_DIR, "public", "assets", "posts");
const LEGACY_FILE = path.join(ROOT_DIR, "public", "assets", "js", "posts-data.js");

function buildPosts({ postsDir, outIndexFile, outPostsDir, legacyFile }) {
  const fullPosts = readAndValidatePosts(postsDir);
  const index = fullPosts.map(({ content, ...meta }) => meta);

  fs.rmSync(outPostsDir, { recursive: true, force: true });
  fs.mkdirSync(outPostsDir, { recursive: true });
  for (const post of fullPosts) {
    fs.writeFileSync(
      path.join(outPostsDir, `${post.id}.json`),
      JSON.stringify(post),
      "utf8"
    );
  }

  fs.mkdirSync(path.dirname(outIndexFile), { recursive: true });
  fs.writeFileSync(
    outIndexFile,
    `// Auto-generated.\nwindow.POSTS = ${JSON.stringify(index, null, 2)};\n`,
    "utf8"
  );
  if (legacyFile) fs.rmSync(legacyFile, { force: true });

  return index;
}

if (require.main === module) {
  const posts = buildSite({
    postsDir: POSTS_DIR,
    publicDir: path.join(ROOT_DIR, 'public'),
    siteUrl: 'https://inskr.github.io/Infighting/',
  });
  console.log("Generated " + OUT_INDEX_FILE + " with " + posts.length + " posts.");
}

module.exports = { parseFrontmatter, buildPosts };
