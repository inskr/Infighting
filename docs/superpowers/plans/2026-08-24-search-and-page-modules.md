# Full-Text Search and Page Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shareable full-text article search and replace the multi-page `main.js` implementation with focused, page-loaded Modules.

**Architecture:** Extend the content publication Module to emit a plain-text search index, then provide one deep search Module for normalization, ranking, snippets, URL state, and recovery. Move existing page behavior into focused browser Modules while keeping shared card and shell behavior behind small stable Interfaces.

**Tech Stack:** Node.js 22, CommonJS/UMD browser modules, native DOM APIs, Node test runner, static JSON, GitHub Pages, Express 4.

**Spec:** `docs/superpowers/specs/2026-08-24-static-seo-search-accessibility-design.md`

## Global Constraints

- Execute after `2026-08-24-static-publishing-seo.md` is complete.
- Search only durable technical articles, never daily feed items.
- Search title, summary, tags, and body; support Chinese substrings and case-insensitive technical terms.
- Keep query state in `search.html?q=<query>` and preserve back/forward behavior.
- Every page loads only its shared dependencies and its own page Module.
- Keep statistics, likes, theme, external-URL policy, feeds, and static article URLs working.
- Do not stage or commit unrelated feed-data changes already present in the worktree.
- Follow red-green-refactor and commit only after focused tests pass.

---

### Task 1: Generated Full-Text Search Index

**Files:**
- Modify: `scripts/content-publisher.js`
- Create: `scripts/search-index.js`
- Create: `tests/search-index-build.test.cjs`
- Create generated: `public/assets/search-index.json`

**Interfaces:**
- Produces: `createSearchIndex(posts): Array<SearchDocument>` where each document has `id`, `title`, `summary`, `tags`, `date`, `url`, and `body`.
- Consumes: validated full posts inside `buildSite`.

- [ ] **Step 1: Write the failing index-output test**

```js
test('search index contains durable article text but no feed data or markup', () => {
  const docs = createSearchIndex([{ id: 'alpha', title: 'STM32 DMA', summary: '串口', tags: ['STM32'], date: '2026-01-01', type: 'post', content: '## Setup\nUse `HAL_UART`.' }]);
  assert.deepEqual(Object.keys(docs[0]), ['id', 'title', 'summary', 'tags', 'date', 'url', 'body']);
  assert.match(docs[0].body, /Setup/);
  assert.match(docs[0].body, /HAL_UART/);
  assert.doesNotMatch(docs[0].body, /<h2/);
});
```

Add a `type: 'page'` fixture and assert it is omitted.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/search-index-build.test.cjs`

Expected: FAIL because `scripts/search-index.js` does not exist.

- [ ] **Step 3: Implement plain-text extraction and deterministic output**

Use marked tokens or a renderer that collects visible heading, paragraph, list, table, and code text without HTML tags. Set `url` to `posts/<encoded-id>.html`, preserve source order inside body, and sort documents date descending then ID ascending.

- [ ] **Step 4: Integrate with the publication Module**

Have `buildSite` write `assets/search-index.json` using compact JSON. Add the file to staged-output validation and replacement.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/search-index-build.test.cjs tests/static-articles.test.cjs`

```powershell
git add -- scripts/content-publisher.js scripts/search-index.js tests/search-index-build.test.cjs public/assets/search-index.json
git commit -m "feat: generate article full-text search index"
```

### Task 2: Search Ranking and Snippet Module

**Files:**
- Create: `public/assets/js/search-core.js`
- Create: `tests/search-core.test.cjs`

**Interfaces:**
- Produces: `SearchCore.normalizeQuery(value): { phrase: string, terms: string[] }`.
- Produces: `SearchCore.search(documents, query): Array<{ document, score, snippet, ranges }>`.
- Produces: `SearchCore.createSnippet(body, matches, radius): string`.

- [ ] **Step 1: Write failing ranking tests**

Cover Chinese continuous matching, ASCII case folding, `_` identifiers, exact phrase boost, field priority, stable ties, empty queries, and safe snippets:

```js
assert.equal(search(docs, '边缘 推理')[0].document.id, 'title-hit');
assert.equal(search(docs, 'hal_uart')[0].document.id, 'code-hit');
assert.deepEqual(search(tiedDocs, 'stm32').map(x => x.document.id), ['newer', 'alpha']);
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/search-core.test.cjs`

Expected: FAIL because `search-core.js` does not exist.

- [ ] **Step 3: Implement weighted deterministic search**

Normalize with Unicode NFKC and lowercasing. Score field hits with constants `TITLE=16`, `TAGS=10`, `SUMMARY=5`, `BODY=1`, and add `PHRASE=12` once per matching field. Do not mutate documents. Sort score descending, date descending, ID ascending.

- [ ] **Step 4: Implement bounded snippets**

Choose the earliest body match, return at most `2 * radius` visible characters around it, normalize whitespace, and add ellipses only when text was removed. Return ranges relative to the snippet for DOM highlighting.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/search-core.test.cjs`

```powershell
git add -- public/assets/js/search-core.js tests/search-core.test.cjs
git commit -m "feat: add deterministic full-text search"
```

### Task 3: Search Page, URL State, and Recovery UI

**Files:**
- Create: `public/search.html`
- Create: `public/assets/js/search-page.js`
- Create: `tests/search-page.test.cjs`
- Modify: `public/index.html`
- Modify: `public/tags.html`
- Modify: `public/archive.html`
- Modify: `scripts/article-template.js`
- Modify: `tests/visual-system.test.cjs`

**Interfaces:**
- Produces: `SearchPage.createController(root, options): { init(): void, run(query): Promise<void> }`.
- Consumes: `SearchCore.search`, `ContentCards`, and `assets/search-index.json`.

- [ ] **Step 1: Write failing controller tests**

Use a fake root and injected fetch. Assert empty query does not fetch, first valid query fetches once, later queries reuse documents, failed fetch renders retry state, and `popstate` restores `q`.

```js
await controller.run('STM32');
await controller.run('DMA');
assert.equal(fetchCalls.length, 1);
assert.equal(root.location.search, '?q=DMA');
```

- [ ] **Step 2: Write failing published-page tests**

Assert `search.html` has one labelled search input, a result status region, result container, and page-specific script order. Assert every main navigation contains `data-nav="search"`.

- [ ] **Step 3: Verify RED**

Run: `node --test tests/search-page.test.cjs tests/visual-system.test.cjs`

Expected: FAIL on missing page and controller.

- [ ] **Step 4: Implement the search page**

Fetch `assets/search-index.json` only for a trimmed non-empty query. Use `history.replaceState` for typing-driven query updates and rerun on `popstate`. Render result text and `<mark>` nodes with `createTextNode`; never interpolate index text into HTML.

- [ ] **Step 5: Add navigation and verify recovery**

Add Search to all hand-authored pages and the generated article template. Test HTTP failure, invalid JSON, empty result, retry, clear, copied URL, and result navigation.

- [ ] **Step 6: Commit search UI**

Run: `node --test tests/search-core.test.cjs tests/search-page.test.cjs tests/visual-system.test.cjs`

```powershell
git add -- public/search.html public/assets/js/search-page.js public/index.html public/tags.html public/archive.html scripts/article-template.js tests/search-page.test.cjs tests/visual-system.test.cjs
git commit -m "feat: add shareable article search page"
```

### Task 4: Shared Site Shell and Content Cards

**Files:**
- Create: `public/assets/js/site-shell.js`
- Create: `public/assets/js/content-cards.js`
- Create: `tests/site-shell.test.cjs`
- Create: `tests/content-cards.test.cjs`
- Modify: `public/assets/js/main.js`

**Interfaces:**
- Produces: `SiteShell.init(root, activeNav): void` and `SiteShell.announce(root, message): void`.
- Produces: `ContentCards.postCard(root, post, options): Element` and `ContentCards.statBar(root, post): Element`.

- [ ] **Step 1: Write failing shared-Module tests**

Assert the shell sets year and `aria-current="page"`, and cards link to `posts/<id>.html`, escape text through DOM text nodes, expose a 44px-capable like button class, and display cached statistics.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/site-shell.test.cjs tests/content-cards.test.cjs`

Expected: FAIL because both Modules are missing.

- [ ] **Step 3: Implement the shared Interfaces**

Use UMD wrappers consistent with `theme.js`. Construct caller-owned content with DOM methods. Keep stat fetching and mutation outside `ContentCards`; it only reflects injected/current cached state.

- [ ] **Step 4: Make `main.js` consume the Modules temporarily**

Replace duplicated year, active-nav, stat-bar, tag-link, and post-card implementation with calls to the new Modules. This intermediate state must remain fully functional before page extraction.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/site-shell.test.cjs tests/content-cards.test.cjs tests/post-render.test.cjs tests/visual-system.test.cjs`

```powershell
git add -- public/assets/js/site-shell.js public/assets/js/content-cards.js public/assets/js/main.js tests/site-shell.test.cjs tests/content-cards.test.cjs
git commit -m "refactor: centralize site shell and article cards"
```

### Task 5: Extract Home, Tags, and Archive Page Modules

**Files:**
- Create: `public/assets/js/home-page.js`
- Create: `public/assets/js/tags-page.js`
- Create: `public/assets/js/archive-page.js`
- Create: `tests/home-page.test.cjs`
- Create: `tests/tags-page.test.cjs`
- Create: `tests/archive-page.test.cjs`
- Modify: `public/index.html`
- Modify: `public/tags.html`
- Modify: `public/archive.html`
- Modify: `public/assets/js/main.js`

**Interfaces:**
- Produces: `HomePage.init(root): void`, `TagsPage.init(root): void`, and `ArchivePage.init(root): void`.
- Consumes: `SiteShell`, `ContentCards`, `Stats`, `LikesStorage`, `UrlPolicy`, and page-specific generated data.

- [ ] **Step 1: Write failing behavior tests for each page**

Move existing list, pagination, feed, tag, archive, like rollback, and external-URL cases to their owning test files. Assert pagination uses `aria-current`, reduced motion chooses instant scrolling, and empty feeds remain readable.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/home-page.test.cjs tests/tags-page.test.cjs tests/archive-page.test.cjs`

Expected: FAIL because page Modules do not exist.

- [ ] **Step 3: Extract one complete page at a time**

Move behavior without changing output semantics in this order: archive, tags, home. After each move, load only the new page Module in the corresponding HTML and rerun its focused test.

- [ ] **Step 4: Verify page-specific script maps**

Assert archive does not load posts index or stats, tags does not load feeds, and home does not load search-core or article-page.

- [ ] **Step 5: Commit extracted page behavior**

Run: `node --test tests/home-page.test.cjs tests/tags-page.test.cjs tests/archive-page.test.cjs tests/visual-system.test.cjs`

```powershell
git add -- public/assets/js/home-page.js public/assets/js/tags-page.js public/assets/js/archive-page.js public/index.html public/tags.html public/archive.html public/assets/js/main.js tests/home-page.test.cjs tests/tags-page.test.cjs tests/archive-page.test.cjs tests/visual-system.test.cjs
git commit -m "refactor: load behavior by page"
```

### Task 6: Static Article Enhancement Module

**Files:**
- Create: `public/assets/js/article-page.js`
- Create: `tests/article-page.test.cjs`
- Modify: `scripts/article-template.js`
- Modify: `public/assets/js/main.js`
- Delete: `public/assets/js/post-loader.js`
- Delete: `public/assets/js/post-view.js`
- Modify/Delete: `tests/post-loader.test.cjs`
- Modify/Delete: `tests/post-view.test.cjs`
- Modify: `tests/post-render.test.cjs`

**Interfaces:**
- Produces: `ArticlePage.init(root): Promise<void>`.
- Consumes: trusted article ID from generated `data-article-id`, `Stats`, `LikesStorage`, and highlight.js.

- [ ] **Step 1: Write failing progressive-enhancement tests**

Assert initial HTML already contains body; initialization decorates body images, highlights code, reports one view, updates counts, handles like rollback, and never fetches `assets/posts/<id>.json`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/article-page.test.cjs tests/post-render.test.cjs`

Expected: FAIL because static enhancement still lives in `main.js`.

- [ ] **Step 3: Implement article enhancement**

Read ID only from the generated article element, validate it, decorate images, initialize code highlighting, bind TOC state without rewriting headings, then report the view. Keep content visible if every enhancement dependency is absent.

- [ ] **Step 4: Remove the dynamic-body path**

Delete post-loader and post-view browser files and their obsolete tests after equivalent validation/error coverage exists in static builder and legacy-page tests. Remove marked browser loading from generated pages; retain highlight.js only where code blocks exist or accept page-level article loading if conditional generation is not warranted.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/article-page.test.cjs tests/post-render.test.cjs tests/static-articles.test.cjs tests/legacy-post.test.cjs`

```powershell
git add -A -- public/assets/js/article-page.js public/assets/js/post-loader.js public/assets/js/post-view.js scripts/article-template.js tests/article-page.test.cjs tests/post-loader.test.cjs tests/post-view.test.cjs tests/post-render.test.cjs
git commit -m "refactor: enhance static articles in place"
```

### Task 7: Split Home Effects and Retire `main.js`

**Files:**
- Create: `public/assets/js/home-effects.js`
- Modify: `public/assets/js/ui-effects.js`
- Modify: `tests/ui-effects.test.cjs`
- Create: `tests/home-effects.test.cjs`
- Modify: all `public/*.html`
- Modify: `scripts/article-template.js`
- Delete: `public/assets/js/main.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `HomeEffects.init(root): void` for Hero motion and signal field.
- Preserves: shared spotlight/reveal behavior only in `UiEffects` when used by at least two pages.

- [ ] **Step 1: Write failing ownership and script-map tests**

Assert signal-field and Hero controllers live in HomeEffects, simple/reduced-motion devices do not start animation frames, and no published page references `main.js`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/home-effects.test.cjs tests/ui-effects.test.cjs tests/visual-system.test.cjs`

Expected: FAIL while effects and bootstrapping remain shared.

- [ ] **Step 3: Move homepage-only effects**

Move particle layout, Hero controller, and Canvas controller with their existing tests. HomeEffects must return without binding on coarse pointers or reduced motion. Keep cross-page reveal/spotlight behavior in UiEffects only where real consumers remain.

- [ ] **Step 4: Replace every page script map and delete `main.js`**

Load `site-shell.js` plus exactly one page Module, optional shared helpers, and applicable effects. Remove `main.js` from `public/` and from the `npm test` source-contract expectations.

- [ ] **Step 5: Run complete phase verification**

```powershell
npm run build
npm test
Select-String -Path public\*.html,public\posts\*.html -Pattern 'main\.js|post-loader\.js|post-view\.js'
git diff --check
```

Expected: build and tests pass; search finds no retired runtime references; diff check is clean.

- [ ] **Step 6: Commit the Module migration**

```powershell
git add -A -- public/assets/js public/*.html scripts/article-template.js tests package.json public/posts
git commit -m "refactor: retire the multi-page main module"
```
