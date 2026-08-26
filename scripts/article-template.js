'use strict';

const { marked } = require('marked');
const { escapeHtml, jsonForInlineScript } = require('./output-encoding');

function createHeadingSlugger() {
  const counts = new Map();

  return {
    slug(text) {
      const base = String(text)
        .replace(/<[^>]*>/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/[\s-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
      const count = (counts.get(base) || 0) + 1;
      counts.set(base, count);
      return count === 1 ? base : `${base}-${count}`;
    },
  };
}

function renderArticleContent(content) {
  const headings = [];
  const slugger = createHeadingSlugger();
  const renderer = new marked.Renderer();
  const tokens = marked.lexer(content);
  let shallowestDepth = null;

  marked.walkTokens(tokens, (token) => {
    if (token.type !== 'heading') return;
    shallowestDepth = shallowestDepth === null
      ? token.depth
      : Math.min(shallowestDepth, token.depth);
  });

  renderer.heading = function renderHeading({ tokens, depth }) {
    const rawText = tokens.map((token) => token.raw || token.text || '').join('');
    const id = slugger.slug(rawText);
    const html = this.parser.parseInline(tokens);
    const outputDepth = Math.min(2 + depth - shallowestDepth, 6);
    headings.push({ depth: outputDepth, id, text: rawText });
    return `<h${outputDepth} id="${id}">${html}</h${outputDepth}>\n`;
  };

  renderer.listitem = function renderListItem(item) {
    const html = this.parser.parse(item.tokens);
    return item.task
      ? `<li><label>${html}</label></li>\n`
      : `<li>${html}</li>\n`;
  };

  return { articleHtml: marked.parser(tokens, { renderer }), headings };
}

function renderToc(headings) {
  const links = headings
    .map(
      ({ depth, id, text }) =>
        `<li class="article-toc-level-${depth}"><a href="#${id}">${escapeHtml(text)}</a></li>`
    )
    .join('');
  return `<nav class="article-toc" aria-label="文章目录"><ol>${links}</ol></nav>`;
}

function comparePostsByReadingOrder(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function postHref(id) {
  return `../posts/${encodeURIComponent(id)}.html`;
}

function renderReadingNavigation(post, posts) {
  const orderedPosts = [...posts].sort(comparePostsByReadingOrder);
  const index = orderedPosts.findIndex((candidate) => candidate.id === post.id);
  const previous = orderedPosts[index - 1];
  const next = orderedPosts[index + 1];
  const links = [
    previous && `<a href="${postHref(previous.id)}">上一篇：${escapeHtml(previous.title)}</a>`,
    next && `<a href="${postHref(next.id)}">下一篇：${escapeHtml(next.title)}</a>`,
  ]
    .filter(Boolean)
    .join('');

  return links ? `<nav class="article-navigation" aria-label="文章导航">${links}</nav>` : '';
}

function renderRelatedPosts(post, posts) {
  const tags = new Set(post.tags);
  const relatedPosts = posts
    .filter((candidate) => candidate.id !== post.id)
    .map((candidate) => ({
      post: candidate,
      score: candidate.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return comparePostsByReadingOrder(a.post, b.post);
    })
    .slice(0, 3);

  if (relatedPosts.length === 0) return '';
  const links = relatedPosts
    .map(
      ({ post: relatedPost }) =>
        `<li><a href="${postHref(relatedPost.id)}">${escapeHtml(relatedPost.title)}</a></li>`
    )
    .join('');
  return `<nav class="related-posts" aria-label="相关文章"><ol>${links}</ol></nav>`;
}

function renderArticleStats(post) {
  return `<div class="stats-bar" aria-label="文章统计">
        <button class="like-btn" data-id="${escapeHtml(post.id)}" type="button" aria-label="点赞">
          <svg class="icon-heart" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M12 21s-7.5-4.9-10-9.2C.4 8.9 1.6 5.3 4.8 4.6c1.9-.4 3.7.6 4.8 2 1.1-1.4 2.9-2.4 4.8-2 3.2.7 4.4 4.3 2.8 7.2C19.5 16.1 12 21 12 21z"/></svg>
          <span class="like-count">0</span>
        </button>
        <span class="stat view-count" aria-label="浏览数">
          <svg class="icon-eye" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M1 12.5C2.7 8.1 7 5 12 5s9.3 3.1 11 7.5C21.3 16.9 17 20 12 20S2.7 16.9 1 12.5z"/><circle cx="12" cy="12.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
          <span class="view-count-num">0</span>
        </span>
      </div>`;
}

function renderArticlePage({ post, posts, siteUrl }) {
  const articleUrl = `${siteUrl}posts/${encodeURIComponent(post.id)}.html`;
  const description = post.summary || post.title;
  const jsonLd = jsonForInlineScript({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    url: articleUrl,
    mainEntityOfPage: articleUrl,
    datePublished: post.date,
    dateModified: post.date,
    keywords: post.tags,
  });
  const { articleHtml, headings } = renderArticleContent(post.content);
  const tags = post.tags
    .map(
      (tag) =>
        `<a class="tag" href="../tags.html?tag=${encodeURIComponent(tag)}">${escapeHtml(tag)}</a>`
    )
    .join('');
  const toc = renderToc(headings);
  const readingNavigation = renderReadingNavigation(post, posts);
  const relatedPosts = renderRelatedPosts(post, posts);
  const articleNavigation = [readingNavigation, relatedPosts].filter(Boolean).join('\n      ');
  const articleStats = renderArticleStats(post);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; connect-src 'self' https://abacus.jasoncameron.dev; font-src 'self'; form-action 'self'; img-src 'self' data: https:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'">
  <title>${escapeHtml(post.title)} · Infighting</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(articleUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)} · Infighting">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(articleUrl)}">
  <meta property="article:published_time" content="${escapeHtml(post.date)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(post.title)} · Infighting">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <script type="application/ld+json">${jsonLd}</script>
  <script src="../assets/js/theme.js"></script>
  <link rel="stylesheet" href="../assets/css/style.css">
  <link rel="stylesheet" href="../vendor/highlight-theme.css">
</head>
<body>
  <a class="skip-link" href="#main-content">跳到主要内容</a>
  <header class="site-header">
    <div class="nav-shell glass-surface">
      <a class="brand" href="../index.html" aria-label="Infighting 首页">
        <span class="logo" aria-hidden="true">&gt;_</span>
        <span class="brand-copy">Infighting<small>嵌入式 × 边缘计算</small></span>
      </a>
      <div class="nav-actions">
        <nav class="site-nav" aria-label="主导航">
          <a href="../index.html" data-nav="home">首页</a>
          <a href="../tags.html" data-nav="tags">标签</a>
          <a href="../archive.html" data-nav="archive">精选归档</a>
          <a href="../search.html" data-nav="search">搜索</a>
        </nav>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="切换到浅色主题" aria-pressed="false">
          <span class="theme-icon theme-icon-sun" aria-hidden="true">☼</span>
          <span class="theme-icon theme-icon-moon" aria-hidden="true">☾</span>
        </button>
      </div>
    </div>
  </header>
  <main class="container" id="main-content" tabindex="-1">
    <a class="back-link" href="../index.html">&larr; 返回文章列表</a>
    <article class="article glass-surface" data-article-id="${escapeHtml(post.id)}">
      <header class="article-header">
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta"><span>${escapeHtml(post.date)}</span>${tags}</div>
      </header>
      ${toc}
      <div class="article-body">${articleHtml}</div>
      ${articleStats}
${articleNavigation ? `      ${articleNavigation}\n` : ''}    </article>
  </main>
  <footer class="site-footer">© Infighting | 嵌入式与边缘计算开发笔记</footer>
  <script defer src="../assets/js/stats.js"></script>
  <script defer src="../assets/js/likes-storage.js"></script>
  <script defer src="../vendor/highlight.min.js"></script>
  <script defer src="../assets/js/site-shell.js"></script>
  <script defer src="../assets/js/article-page.js"></script>
  <script defer src="../assets/js/ui-effects.js"></script>
</body>
</html>
`;
}

module.exports = { renderArticlePage };
