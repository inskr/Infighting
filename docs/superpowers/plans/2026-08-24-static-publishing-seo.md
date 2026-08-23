# Static Publishing and SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish every Markdown article as crawlable static HTML with canonical metadata, sitemap, RSS, and a safe legacy URL migration.

**Architecture:** Deepen the existing post builder into one content publication Module whose `buildSite(options)` Interface produces and validates every article-derived artifact before publishing managed outputs. Static HTML owns initial article content; browser JavaScript remains progressive enhancement for statistics and likes.

**Tech Stack:** Node.js 22, CommonJS, marked, native HTML/CSS/JavaScript, Node test runner, Express 4, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-24-static-seo-search-accessibility-design.md`

## Global Constraints

- Keep `public/` as the only published directory.
- Keep both GitHub Pages at `/Infighting/` and Express root hosting operational.
- Use `https://inskr.github.io/Infighting/` for absolute SEO URLs.
- Keep the portable content-ID and ASCII case-folding rules unchanged.
- Use relative runtime URLs inside nested article pages.
- Do not add an About page or personal-brand content.
- Do not stage or commit unrelated feed-data changes already present in the worktree.
- Follow red-green-refactor and commit only after focused tests pass.

---

### Task 1: Content Publication Module and Static Article Output

**Files:**
- Create: `scripts/content-publisher.js`
- Create: `scripts/article-template.js`
- Modify: `scripts/build-posts.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/build-posts.test.cjs`
- Create: `tests/static-articles.test.cjs`

**Interfaces:**
- Produces: `buildSite({ postsDir, publicDir, siteUrl }): Array<PostIndexEntry>`.
- Produces: `renderArticlePage({ post, posts, siteUrl }): string`.
- Preserves: `buildPosts({ postsDir, outIndexFile, outPostsDir, legacyFile })` as a compatibility wrapper for existing callers until Task 6.

- [ ] **Step 1: Install the build-time Markdown renderer**

Run: `npm install --save-dev marked`

Expected: `package.json` and `package-lock.json` record `marked`; no runtime browser dependency is added.

- [ ] **Step 2: Write the failing static article contract test**

Add a temporary-post fixture to `tests/static-articles.test.cjs` and assert the build emits initial HTML:

```js
test('buildSite emits crawlable article HTML and keeps compatibility JSON', () => {
  const result = buildSite({ postsDir, publicDir, siteUrl: SITE_URL });
  const html = fs.readFileSync(path.join(publicDir, 'posts', 'alpha.html'), 'utf8');
  const json = JSON.parse(fs.readFileSync(path.join(publicDir, 'assets', 'posts', 'alpha.json')));
  assert.equal(result[0].id, 'alpha');
  assert.match(html, /<h1>Alpha<\/h1>/);
  assert.match(html, /<div class="article-body">[\s\S]*<h2/);
  assert.equal(json.content, '## Body');
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test tests/static-articles.test.cjs`

Expected: FAIL because `scripts/content-publisher.js` and `buildSite` do not exist.

- [ ] **Step 4: Implement the minimal publication seam**

Move source reading and validation behind `buildSite`, reuse the existing ID functions, and render trusted repository Markdown with marked:

```js
function buildSite({ postsDir, publicDir, siteUrl }) {
  const posts = readAndValidatePosts(postsDir);
  writePostIndex(publicDir, posts);
  writeCompatibilityDocuments(publicDir, posts);
  writeArticlePages(publicDir, posts, siteUrl);
  return posts.map(({ content, ...entry }) => entry);
}
```

`scripts/build-posts.js` must call `buildSite` with repository defaults while keeping its existing exports until all old tests are migrated.

- [ ] **Step 5: Run focused and existing builder tests**

Run: `node --test tests/static-articles.test.cjs tests/build-posts.test.cjs`

Expected: PASS; invalid, duplicate, case-folded, and Windows-reserved IDs still fail before output.

- [ ] **Step 6: Commit the publication seam**

```powershell
git add -- scripts/content-publisher.js scripts/article-template.js scripts/build-posts.js package.json package-lock.json tests/build-posts.test.cjs tests/static-articles.test.cjs
git commit -m "feat: publish crawlable static article pages"
```

### Task 2: Article Headings, Navigation, and Related Content

**Files:**
- Modify: `scripts/content-publisher.js`
- Modify: `scripts/article-template.js`
- Modify: `tests/static-articles.test.cjs`
- Modify generated: `public/posts/*.html`

**Interfaces:**
- Produces: `createHeadingSlugger(): { slug(text: string): string }` internal to the publication Implementation.
- Produces: static TOC, previous/next links, and at most three related posts ranked by shared tags.

- [ ] **Step 1: Add failing generated-navigation tests**

```js
test('article pages contain stable headings and canonical reading paths', () => {
  const html = buildFixtureAndRead('alpha.html');
  assert.match(html, /<nav class="article-toc" aria-label="文章目录">/);
  assert.match(html, /<h2 id="setup">Setup<\/h2>/);
  assert.match(html, /href="\.\.\/posts\/beta\.html"/);
  assert.match(html, /<nav class="related-posts" aria-label="相关文章">/);
  assert.doesNotMatch(html, /post\.html\?id=/);
});
```

Include duplicate headings and assert suffixes `setup` and `setup-2`. Include tied related posts and assert date then ID ordering.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/static-articles.test.cjs`

Expected: FAIL on missing IDs, TOC, or new navigation URLs.

- [ ] **Step 3: Implement heading and relation generation**

Use a per-article slugger and marked heading renderer. Compute related score as shared-tag count, exclude the current article, then sort by score descending, date descending, ID ascending. Generate all nested links as `../posts/<encoded-id>.html` and tag links as `../tags.html?tag=<encoded-tag>`.

- [ ] **Step 4: Regenerate and verify**

Run: `node --test tests/static-articles.test.cjs && npm run build:posts`

Expected: PASS and every generated article contains static reading navigation.

- [ ] **Step 5: Commit article reading paths**

```powershell
git add -- scripts/content-publisher.js scripts/article-template.js tests/static-articles.test.cjs public/posts public/assets/js/posts-index.js public/assets/posts
git commit -m "feat: add static article navigation and related posts"
```

### Task 3: Canonical, Social Metadata, and JSON-LD

**Files:**
- Modify: `scripts/article-template.js`
- Create: `scripts/output-encoding.js`
- Create: `tests/seo-output.test.cjs`
- Modify generated: `public/posts/*.html`

**Interfaces:**
- Produces: `escapeHtml(value)`, `escapeXml(value)`, and `jsonForInlineScript(value)` with context-specific encoding.
- Consumes: article metadata and `siteUrl` from `buildSite`.

- [ ] **Step 1: Write failing metadata and injection tests**

```js
test('article metadata uses absolute canonical and safe JSON-LD', () => {
  const html = buildHostileFixture();
  assert.match(html, /rel="canonical" href="https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html"/);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const json = extractJsonLd(html);
  assert.equal(json['@type'], 'BlogPosting');
  assert.equal(json.url, SITE_URL + 'posts/alpha.html');
  assert.doesNotMatch(html, /<\/script><script>/i);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/seo-output.test.cjs`

Expected: FAIL because article-specific metadata and encoding helpers are missing.

- [ ] **Step 3: Implement context-specific encoding and metadata**

Serialize JSON-LD with `JSON.stringify(value).replace(/</g, '\\u003c')`; do not pass JSON through HTML escaping. Add unique title, description, canonical, Open Graph, Twitter Card, and `BlogPosting` fields to the article template.

- [ ] **Step 4: Run SEO and security regressions**

Run: `node --test tests/seo-output.test.cjs tests/api-security.test.cjs tests/security-exposure.test.cjs`

Expected: PASS with hostile fixture text rendered as data, never markup.

- [ ] **Step 5: Commit SEO metadata**

```powershell
git add -- scripts/article-template.js scripts/output-encoding.js tests/seo-output.test.cjs public/posts
git commit -m "feat: generate article SEO metadata"
```

### Task 4: Sitemap and RSS

**Files:**
- Modify: `scripts/content-publisher.js`
- Create: `scripts/discovery-output.js`
- Create: `tests/discovery-output.test.cjs`
- Modify: `public/index.html`
- Create generated: `public/sitemap.xml`
- Create generated: `public/rss.xml`

**Interfaces:**
- Produces: `renderSitemap({ posts, siteUrl }): string`.
- Produces: `renderRss({ posts, siteUrl }): string`.

- [ ] **Step 1: Write failing XML discovery tests**

Assert sitemap contains canonical article URLs but no `post.html?id=`, and RSS has stable GUIDs, descending dates, escaped hostile text, and no feed-news items.

```js
assert.match(sitemap, /https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html/);
assert.doesNotMatch(sitemap, /post\.html\?id=/);
assert.match(rss, /<guid isPermaLink="true">https:\/\/inskr\.github\.io\/Infighting\/posts\/alpha\.html<\/guid>/);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/discovery-output.test.cjs`

Expected: FAIL because neither XML file exists.

- [ ] **Step 3: Implement deterministic XML output**

Use `escapeXml`, fixed channel metadata, source dates as sitemap `lastmod`, and posts sorted date descending then ID ascending. Add `<link rel="alternate" type="application/rss+xml" title="Infighting RSS" href="https://inskr.github.io/Infighting/rss.xml">` to the homepage.

- [ ] **Step 4: Verify XML and build determinism**

Run the builder twice and compare hashes, then run tests:

```powershell
npm run build:posts
$first=(Get-FileHash public/sitemap.xml).Hash + (Get-FileHash public/rss.xml).Hash
npm run build:posts
$second=(Get-FileHash public/sitemap.xml).Hash + (Get-FileHash public/rss.xml).Hash
if ($first -ne $second) { throw 'Discovery output is not deterministic' }
node --test tests/discovery-output.test.cjs
```

Expected: hashes match and tests pass.

- [ ] **Step 5: Commit discovery files**

```powershell
git add -- scripts/content-publisher.js scripts/discovery-output.js scripts/output-encoding.js tests/discovery-output.test.cjs public/index.html public/sitemap.xml public/rss.xml
git commit -m "feat: publish sitemap and RSS discovery"
```

### Task 5: Safe Legacy URL Migration and Site-Link Conversion

**Files:**
- Create: `public/assets/js/legacy-post.js`
- Modify: `public/post.html`
- Modify: `public/assets/js/main.js`
- Modify: `tests/post-render.test.cjs`
- Create: `tests/legacy-post.test.cjs`
- Modify: `tests/visual-system.test.cjs`

**Interfaces:**
- Produces: `LegacyPost.resolveTarget(root, id, publishedIds): string | null`.
- Preserves: readable error UI for missing, invalid, and unknown article IDs.

- [ ] **Step 1: Write failing legacy-resolution tests**

```js
assert.equal(LegacyPost.resolveTarget(root, 'alpha', ['alpha']), 'posts/alpha.html');
assert.equal(LegacyPost.resolveTarget(root, '../alpha', ['alpha']), null);
assert.equal(LegacyPost.resolveTarget(root, 'missing', ['alpha']), null);
```

Add page-contract assertions that homepage, tags, previous/next and related links contain `posts/<id>.html` and no generated link contains `post.html?id=`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/legacy-post.test.cjs tests/post-render.test.cjs tests/visual-system.test.cjs`

Expected: FAIL on missing module and old links.

- [ ] **Step 3: Implement the compatibility page**

Use the shared portable-ID pattern and exact index membership before `location.replace`. Keep a static fallback heading and return link in `post.html`; load only `posts-index.js`, `legacy-post.js`, theme, and shared styling. Do not load marked, highlight, stats, likes, post-loader, or post-view on the compatibility page.

- [ ] **Step 4: Convert runtime links**

Change `postCardHtml` and any remaining article link generators in `main.js` to `posts/<encoded-id>.html`. Static article navigation is already generated by Task 2.

- [ ] **Step 5: Verify migration behavior**

Run: `node --test tests/legacy-post.test.cjs tests/post-render.test.cjs tests/visual-system.test.cjs tests/security-exposure.test.cjs`

Expected: PASS; invalid IDs never reach `location.replace` or statistics.

- [ ] **Step 6: Commit the migration**

```powershell
git add -- public/post.html public/assets/js/legacy-post.js public/assets/js/main.js tests/legacy-post.test.cjs tests/post-render.test.cjs tests/visual-system.test.cjs
git commit -m "feat: migrate legacy article URLs safely"
```

### Task 6: Staged Managed Outputs, Cache Policy, and Phase Verification

**Files:**
- Modify: `scripts/content-publisher.js`
- Modify: `scripts/build-posts.js`
- Modify: `src/app.js`
- Modify: `tests/build-posts.test.cjs`
- Modify: `tests/static-cache.test.cjs`
- Modify: `README.md`
- Modify: `DEPLOY.md`

**Interfaces:**
- Produces: validate-all-then-publish behavior for managed article, JSON, index, sitemap, and RSS outputs.
- Preserves: one-hour cache for mutable generated discovery data and HTML; one-week cache for fingerprint-stable visual assets.

- [ ] **Step 1: Write the failing staged-output test**

Seed a valid published result, inject a second post whose render throws, rerun the builder, and assert all original managed files remain byte-identical. Add cache assertions for `/sitemap.xml`, `/rss.xml`, and `/posts/<id>.html` using the short policy.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/build-posts.test.cjs tests/static-cache.test.cjs`

Expected: FAIL because output replacement is currently eager and XML cache rules are absent.

- [ ] **Step 3: Implement staged publication**

Build every managed output below a unique temporary sibling directory, validate expected file counts and parse generated JSON/XML, then replace managed paths. Always remove the temporary directory in `finally`; never remove unrelated hand-authored files under `public/`.

- [ ] **Step 4: Update cache and documentation contracts**

Classify `.html`, `sitemap.xml`, `rss.xml`, `posts-index.js`, and article JSON as short-cache resources. Update publishing instructions to use `posts/<id>.html`, explain legacy compatibility, sitemap, and RSS.

- [ ] **Step 5: Run phase verification**

Run:

```powershell
npm run build
npm test
npm audit
git diff --check
```

Expected: build exits 0; all regression tests pass; audit reports no high-severity vulnerability; diff check is clean.

- [ ] **Step 6: Inspect published references**

```powershell
Select-String -Path public\*.html,public\posts\*.html -Pattern 'post\.html\?id=|posts-data\.js'
```

Expected: no generated navigation uses the legacy query URL and no page uses the removed aggregate.

- [ ] **Step 7: Commit phase completion**

```powershell
git add -- scripts/content-publisher.js scripts/build-posts.js src/app.js tests/build-posts.test.cjs tests/static-cache.test.cjs README.md DEPLOY.md public/posts public/assets/js/posts-index.js public/assets/posts public/sitemap.xml public/rss.xml
git commit -m "build: publish SEO artifacts transactionally"
```
