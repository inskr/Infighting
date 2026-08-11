# Mobile Performance and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有静态站点架构的前提下，优化全站移动端加载与渲染性能，统一手机主题按钮，增加 Hero 慢速运镜和影视飓风鸣谢链接。

**Architecture:** 构建脚本将 Markdown 拆为轻量索引与按 ID 存储的单篇 JSON，文章页通过一个独立、可测试的加载器按需请求正文。图片构建脚本用 Sharp 生成多尺寸 AVIF/WebP/PNG，页面按需引用脚本和数据；CSS 负责轻量动效、移动端简化和主题按钮一致性。

**Tech Stack:** Node.js 22、CommonJS、原生 JavaScript、HTML/CSS、Node test runner、Express 4、Sharp、GitHub Pages。

## Global Constraints

- 不更改现有页面 URL、文章 `post.html?id=<id>` 格式或统计 API。
- 继续只发布 `public/`，不引入 SPA 或客户端框架。
- 浏览器内容 ID 必须符合 `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`。
- Hero 动效只修改 `transform`，在 `prefers-reduced-motion: reduce` 下完全关闭。
- 手机主题按钮保留日月图标和至少 `44×44px` 触控区。
- 页脚链接固定为 `https://www.ysjf.com/index`，使用 `target="_blank" rel="noopener noreferrer"`。
- 用测试先行的红—绿—重构循环实施每项行为改动。

---

## File Structure

- `scripts/build-posts.js`：解析 Markdown，生成轻量索引和单篇正文 JSON。
- `scripts/build-images.js`：从非发布源图生成 Hero 响应式发布资源。
- `assets/images/hero-ink-source.png`：保留 6400 px 原图，不被静态服务发布。
- `public/assets/js/posts-index.js`：自动生成的文章元数据。
- `public/assets/posts/<id>.json`：自动生成的单篇文章数据。
- `public/assets/js/post-loader.js`：校验 ID 并按需获取单篇文章，不负责 DOM 渲染。
- `public/assets/js/post-view.js`：生成文章错误状态并为已渲染正文图片添加懒加载属性。
- `public/assets/js/main.js`：消费索引与加载器，处理页面渲染、错误态和正文图片属性。
- `public/assets/css/style.css`：手机导航、Hero 慢速运镜、移动端渲染简化与页脚链接样式。
- `public/*.html`：响应式 Hero、页脚文案、按页面精简的 `defer` 脚本引用。
- `src/app.js`：按资源类型设定自托管静态缓存响应头。

### Task 1: Split the generated post catalog

**Files:**
- Modify: `scripts/build-posts.js`
- Create: `tests/build-posts.test.cjs`
- Create generated: `public/assets/js/posts-index.js`
- Create generated: `public/assets/posts/*.json`
- Remove generated: `public/assets/js/posts-data.js`

**Interfaces:**
- Produces: `parseFrontmatter(raw: string): { meta: object, content: string }`
- Produces: `buildPosts(options): Array<PostIndexEntry>` where options contains `postsDir`, `outIndexFile`, `outPostsDir`, and `legacyFile`.
- Produces in browser: `window.POSTS: Array<{id,title,date,tags,summary,type}>` with no `content` property.

- [ ] **Step 1: Write failing build-output tests**

Create a temporary posts directory with two Markdown fixtures, call `buildPosts`, then assert the index has no正文 and each JSON has正文:

```js
test('builds a metadata-only index and one JSON document per post', () => {
  const result = buildPosts(paths);
  const indexSource = fs.readFileSync(paths.outIndexFile, 'utf8');
  const article = JSON.parse(fs.readFileSync(path.join(paths.outPostsDir, 'alpha.json'), 'utf8'));
  assert.equal(result[0].content, undefined);
  assert.doesNotMatch(indexSource, /"content"/);
  assert.equal(article.id, 'alpha');
  assert.equal(article.content, '# Body');
});

test('removes the legacy aggregate and stale article JSON files', () => {
  buildPosts(paths);
  assert.equal(fs.existsSync(paths.legacyFile), false);
  assert.equal(fs.existsSync(path.join(paths.outPostsDir, 'stale.json')), false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/build-posts.test.cjs`

Expected: FAIL because `buildPosts` is not exported and split outputs do not exist.

- [ ] **Step 3: Implement the split builder**

Refactor the script behind `if (require.main === module)` and implement the exact output boundary:

```js
function buildPosts({ postsDir, outIndexFile, outPostsDir, legacyFile }) {
  const fullPosts = readAndValidatePosts(postsDir);
  const index = fullPosts.map(({ content, ...meta }) => meta);
  fs.rmSync(outPostsDir, { recursive: true, force: true });
  fs.mkdirSync(outPostsDir, { recursive: true });
  for (const post of fullPosts) {
    fs.writeFileSync(path.join(outPostsDir, `${post.id}.json`), JSON.stringify(post), 'utf8');
  }
  fs.mkdirSync(path.dirname(outIndexFile), { recursive: true });
  fs.writeFileSync(outIndexFile, `// Auto-generated.\nwindow.POSTS = ${JSON.stringify(index, null, 2)};\n`, 'utf8');
  if (legacyFile) fs.rmSync(legacyFile, { force: true });
  return index;
}
```

Keep the existing invalid-ID and duplicate-ID failures unchanged and export `{ parseFrontmatter, buildPosts }`.

- [ ] **Step 4: Verify GREEN and regenerate repository outputs**

Run: `node --test tests/build-posts.test.cjs && node scripts/build-posts.js`

Expected: PASS; `posts-index.js` exists, each known ID has a JSON file, and `posts-data.js` is absent.

- [ ] **Step 5: Commit the content boundary**

```bash
git add scripts/build-posts.js tests/build-posts.test.cjs public/assets/js/posts-index.js public/assets/posts public/assets/js/posts-data.js
git commit -m "perf: split post index from article bodies"
```

### Task 2: Load and render one article on demand

**Files:**
- Create: `public/assets/js/post-loader.js`
- Create: `public/assets/js/post-view.js`
- Create: `tests/post-loader.test.cjs`
- Create: `tests/post-view.test.cjs`
- Modify: `public/assets/js/main.js`

**Interfaces:**
- Consumes: `window.POSTS` metadata from Task 1.
- Produces: `PostLoader.isValidPostId(id): boolean`.
- Produces: `PostLoader.loadPost(root, id): Promise<object>`; rejects with errors whose `code` is `INVALID_ID`, `NOT_FOUND`, or `LOAD_FAILED`.
- Produces: `PostView.errorCardHtml(error): string` and `PostView.decorateArticleImages(container): number`.

- [ ] **Step 1: Write failing loader and rendering-contract tests**

```js
test('loads only the validated article JSON path', async () => {
  const calls = [];
  const root = { fetch: async (url) => { calls.push(url); return { ok: true, json: async () => ({ id: 'alpha', content: '# Body' }) }; } };
  const post = await PostLoader.loadPost(root, 'alpha');
  assert.equal(post.id, 'alpha');
  assert.deepEqual(calls, ['assets/posts/alpha.json']);
});

test('rejects invalid IDs before fetching', async () => {
  await assert.rejects(() => PostLoader.loadPost({ fetch() { throw new Error('must not fetch'); } }, '../secret'), { code: 'INVALID_ID' });
});
```

Test the real view helpers rather than searching production source text:

```js
test('renders a readable load failure with a return link', () => {
  const html = PostView.errorCardHtml({ code: 'LOAD_FAILED' });
  assert.match(html, /文章加载失败/);
  assert.match(html, /href="index\.html"/);
});

test('decorates every rendered article image for deferred decoding', () => {
  const images = [fakeImage(), fakeImage()];
  const count = PostView.decorateArticleImages({ querySelectorAll: () => images });
  assert.equal(count, 2);
  assert.deepEqual(images[0].attributes, { loading: 'lazy', decoding: 'async' });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/post-loader.test.cjs tests/post-view.test.cjs`

Expected: FAIL because the loader and view modules do not exist.

- [ ] **Step 3: Implement the loader and asynchronous article flow**

Use UMD wrappers matching `theme.js` and `ui-effects.js`. The loader must validate before building the path and classify HTTP/parse failures. `post-view.js` owns error-card HTML and image decoration. Change `renderPost` to return a promise, render a loading card, await `PostLoader.loadPost(window, id)`, and only after success run Markdown parsing, navigation, stats, highlighting, table wrapping, and:

```js
PostView.decorateArticleImages(container);
```

For invalid/missing/load failures, render one shared error card with a “返回文章列表” link. Do not report a view when loading fails.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/post-loader.test.cjs tests/post-view.test.cjs tests/reveal.test.cjs`

Expected: PASS with no unhandled promise rejection.

- [ ] **Step 5: Commit on-demand loading**

```bash
git add public/assets/js/post-loader.js public/assets/js/post-view.js public/assets/js/main.js tests/post-loader.test.cjs tests/post-view.test.cjs
git commit -m "perf: load article bodies on demand"
```

### Task 3: Build responsive Hero image assets

**Files:**
- Create: `scripts/build-images.js`
- Create: `tests/build-images.test.cjs`
- Move: `public/assets/images/hero-ink.png` to `assets/images/hero-ink-source.png`
- Create generated: `public/assets/images/hero-ink-{640,1280,1920}.{avif,webp}`
- Create generated: `public/assets/images/hero-ink-1920.png`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: `buildHeroImages({ source, outputDir, widths }): Promise<Array<{path,width,format}>>`.
- Consumes: Sharp as a development dependency; Node.js 22 in local and CI builds.

- [ ] **Step 1: Add Sharp and write failing image-pipeline tests**

Run `npm install --save-dev sharp`, then create a small temporary source image with Sharp. Test that `buildHeroImages` emits AVIF/WebP for requested widths and a 1920 px PNG fallback:

```js
test('writes bounded responsive hero variants', async () => {
  const outputs = await buildHeroImages({ source, outputDir, widths: [640, 1280, 1920] });
  assert.equal(outputs.length, 7);
  for (const output of outputs) {
    const meta = await sharp(output.path).metadata();
    assert.ok(meta.width <= 1920);
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/build-images.test.cjs`

Expected: FAIL because `scripts/build-images.js` does not exist.

- [ ] **Step 3: Implement deterministic image generation and build commands**

Generate widths `[640, 1280, 1920]` with `withoutEnlargement: true`; use AVIF quality 55, WebP quality 72, and PNG compression level 9. Export `buildHeroImages` and call it from the CLI entry point. Update scripts to:

```json
{
  "build": "npm run build:posts && npm run build:images",
  "build:posts": "node scripts/build-posts.js",
  "build:images": "node scripts/build-images.js"
}
```

Update GitHub Actions to run `npm ci` before `npm run build`; replace the outdated “无第三方依赖” comment.

- [ ] **Step 4: Verify outputs and size budget**

Run: `node --test tests/build-images.test.cjs && npm run build:images`

Expected: PASS; no published image exceeds 1920 px wide, and the combined mobile AVIF/WebP variants are each well below the original 4.6 MB PNG.

- [ ] **Step 5: Commit the image pipeline**

```bash
git add assets/images scripts/build-images.js tests/build-images.test.cjs public/assets/images package.json package-lock.json .github/workflows/deploy.yml
git commit -m "perf: generate responsive hero images"
```

### Task 4: Wire page-specific resources and visual polish

**Files:**
- Modify: `public/index.html`
- Modify: `public/tags.html`
- Modify: `public/archive.html`
- Modify: `public/post.html`
- Modify: `public/about.html`
- Modify: `public/assets/css/style.css`
- Modify: `tests/visual-system.test.cjs`
- Modify: `tests/theme.test.cjs`

**Interfaces:**
- Consumes: `posts-index.js`, `post-loader.js`, and responsive Hero assets from Tasks 1–3.
- Produces: consistent page script maps, a responsive `<picture>`, unified footer markup, and CSS-only Hero motion.

- [ ] **Step 1: Write failing published-page assertions**

Extend `visual-system.test.cjs` to assert:

```js
assert.match(home, /<picture class="hero-media">/);
assert.match(home, /type="image\/avif"/);
assert.match(home, /fetchpriority="high"/);
assert.doesNotMatch(home, /posts-data\.js/);
assert.match(post, /assets\/js\/post-loader\.js/);
assert.doesNotMatch(about, /posts-index\.js/);
assert.doesNotMatch(archive, /posts-index\.js/);
for (const html of pages) {
  assert.match(html, /href="https:\/\/www\.ysjf\.com\/index"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
}
```

Do not add source-text assertions for CSS. The published-page tests cover the real HTML responses; Step 4 includes browser-level responsive and reduced-motion checks for the visual behavior.

- [ ] **Step 2: Run visual tests and verify RED**

Run: `node --test tests/visual-system.test.cjs tests/theme.test.cjs`

Expected: FAIL on missing picture sources, old script references, footer link, and post view/loader scripts.

- [ ] **Step 3: Update all page markup and script loading**

Replace the Hero image with AVIF/WebP `srcset` values for 640/1280/1920 widths plus the 1920 PNG fallback. Add `width="1920" height="1080" decoding="async" fetchpriority="high"` to the fallback image. Keep `theme.js` before CSS without `defer`; add `defer` to all remaining scripts while preserving dependency order. Use `posts-index.js` only on index/tags/post and insert `post-loader.js` and `post-view.js` before `main.js` only on post.

Replace every footer with the approved acknowledgement link and exact security attributes.

- [ ] **Step 4: Implement CSS motion and mobile simplification**

Add `heroCinematicDrift` with only `transform`, use 9 seconds and `alternate ease-in-out infinite`; reduce the end transform under 680 px. Remove the mobile absolute theme positioning and `nav-shell` right padding. Keep the theme button at 44 px, use the same border radius/background family as `.site-nav a`, and let only `.site-nav` scroll. Under coarse pointers/mobile, reduce or remove backdrop blur and heavy shadows. In reduced motion, explicitly disable Hero animation.

Start the local server and verify at 390 px that the theme control stays in normal flow without covering navigation. Emulate `prefers-reduced-motion: reduce` and confirm the Hero image transform remains static; then disable emulation and confirm the 9-second drift runs without changing layout geometry.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test tests/visual-system.test.cjs tests/theme.test.cjs tests/ui-effects.test.cjs`

Expected: PASS.

```bash
git add public/index.html public/tags.html public/archive.html public/post.html public/about.html public/assets/css/style.css tests/visual-system.test.cjs tests/theme.test.cjs
git commit -m "feat: polish mobile navigation hero and footer"
```

### Task 5: Add static cache policy without caching APIs

**Files:**
- Modify: `src/app.js`
- Create: `tests/static-cache.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `setStaticCacheHeaders(res, filePath): void`.
- Preserves: every `/api/*` response uses `Cache-Control: no-store`.

- [ ] **Step 1: Write failing cache-policy tests**

Start an injected test server and assert:

```js
assert.match((await fetch(`${baseUrl}/assets/images/hero-ink-640.webp`)).headers.get('cache-control'), /max-age=604800/);
assert.match((await fetch(`${baseUrl}/assets/js/posts-index.js`)).headers.get('cache-control'), /max-age=3600/);
assert.match((await fetch(`${baseUrl}/assets/posts/stm32-baremetal-scheduler.json`)).headers.get('cache-control'), /max-age=3600/);
assert.equal((await fetch(`${baseUrl}/api/content/stats`)).headers.get('cache-control'), 'no-store');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/static-cache.test.cjs`

Expected: FAIL because static responses use Express defaults.

- [ ] **Step 3: Implement extension/path-based cache headers**

Pass `setHeaders: setStaticCacheHeaders` to `express.static`. Use `public, max-age=604800, must-revalidate` for images, CSS, vendor assets, and ordinary JavaScript; use `public, max-age=3600, must-revalidate` for HTML, `posts-index.js`, feed data, and `assets/posts/*.json`; retain ETag. Evaluate the short-cache data paths before the general `.js` rule. Do not change the earlier `/api` middleware.

- [ ] **Step 4: Verify GREEN and include all new tests in `npm test`**

Run: `node --test tests/static-cache.test.cjs tests/api-security.test.cjs tests/security-exposure.test.cjs`

Expected: PASS and API headers remain `no-store`.

Update the `npm test` script to include `build-posts.test.cjs`, `build-images.test.cjs`, `post-loader.test.cjs`, `post-view.test.cjs`, and `static-cache.test.cjs` in the Node test-runner group.

- [ ] **Step 5: Commit cache behavior**

```bash
git add src/app.js tests/static-cache.test.cjs package.json
git commit -m "perf: cache static assets by resource type"
```

### Task 6: Full build, regression, and delivery verification

**Files:**
- Verify all files changed in Tasks 1–5.
- Modify only if verification exposes a regression in the task scope.

**Interfaces:**
- Consumes all previous task outputs.
- Produces a clean production build and evidence-backed handoff.

- [ ] **Step 1: Run a clean production build**

Run: `npm run build`

Expected: exit 0; index and per-post JSON regenerate; responsive images regenerate; no `public/assets/js/posts-data.js` returns.

- [ ] **Step 2: Run the complete regression suite**

Run: `npm test`

Expected: exit 0 with every existing and new test passing and no warnings attributable to the changes.

- [ ] **Step 3: Inspect published asset budgets and references**

Run in PowerShell:

```powershell
Get-ChildItem public/assets/images/hero-ink-* | Sort-Object Length -Descending | Select-Object Name,Length
Select-String -Path public/*.html -Pattern 'posts-data.js|hero-ink.png'
git diff --check HEAD~5..HEAD
```

Expected: responsive files are materially smaller than 4.6 MB; no page references the legacy aggregate or original Hero filename; diff check is clean.

- [ ] **Step 4: Perform responsive smoke checks**

Start `npm start` and inspect index, tags, archive, post, and about at 390 px and desktop width. Confirm the theme control does not overlap navigation, Hero motion is subtle, reduced motion disables it, one article JSON is requested per article page, failure UI is readable, and the footer link opens the approved URL.

- [ ] **Step 5: Commit any verification-only correction, otherwise record clean status**

If Step 4 required an in-scope correction, rerun Steps 1–3 and commit only that correction:

```powershell
git diff --name-only | ForEach-Object { git add -- $_ }
git commit -m "fix: address mobile performance verification"
```

If no correction was needed, do not create an empty commit.
