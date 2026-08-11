// Build posts/*.md into a lightweight browser index and per-article documents.
// Usage: node scripts/build-posts.js
const fs = require("fs");
const path = require("path");
const { isValidContentId } = require("../src/content-id");

const ROOT_DIR = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT_DIR, "posts");
const OUT_INDEX_FILE = path.join(ROOT_DIR, "public", "assets", "js", "posts-index.js");
const OUT_POSTS_DIR = path.join(ROOT_DIR, "public", "assets", "posts");
const LEGACY_FILE = path.join(ROOT_DIR, "public", "assets", "js", "posts-data.js");

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (!field) return;

    let value = field[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
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
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
      const { meta, content } = parseFrontmatter(raw);
      return {
        id: meta.id || file.replace(/\.md$/, ""),
        title: meta.title || "未命名",
        date: meta.date || "1970-01-01",
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        summary: meta.summary || "",
        type: meta.type || "post",
        content: content.trim(),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const seenIds = new Set();
  for (const post of posts) {
    if (!isValidContentId(post.id)) {
      throw new Error(
        "Invalid post id '" +
          post.id +
          "'. Use 1-128 ASCII letters, numbers, underscores, or hyphens."
      );
    }
    if (seenIds.has(post.id)) {
      throw new Error("Duplicate post id: " + post.id);
    }
    seenIds.add(post.id);
  }

  return posts;
}

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
  const posts = buildPosts({
    postsDir: POSTS_DIR,
    outIndexFile: OUT_INDEX_FILE,
    outPostsDir: OUT_POSTS_DIR,
    legacyFile: LEGACY_FILE,
  });
  console.log("Generated " + OUT_INDEX_FILE + " with " + posts.length + " posts.");
}

module.exports = { parseFrontmatter, buildPosts };
