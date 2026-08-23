'use strict';

const { marked } = require('marked');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  renderer.heading = function renderHeading({ tokens, depth }) {
    const rawText = tokens.map((token) => token.raw || token.text || '').join('');
    const id = slugger.slug(rawText);
    const html = this.parser.parseInline(tokens);
    if (depth >= 2) headings.push({ depth, id, text: rawText });
    return `<h${depth} id="${id}">${html}</h${depth}>\n`;
  };

  return { articleHtml: marked.parse(content, { renderer }), headings };
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

function renderArticlePage({ post, posts, siteUrl }) {
  void siteUrl;

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

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="../favicon.svg" type="image/svg+xml">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; connect-src 'self' https://abacus.jasoncameron.dev; font-src 'self'; form-action 'self'; img-src 'self' data: https:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'">
  <title>${escapeHtml(post.title)} · Infighting</title>
  <script src="../assets/js/theme.js"></script>
  <link rel="stylesheet" href="../assets/css/style.css">
</head>
<body>
  <header class="site-header">
    <div class="nav-shell glass-surface">
      <a class="brand" href="../index.html" aria-label="Infighting 首页">
        <span class="logo" aria-hidden="true">&gt;_</span>
        <span class="brand-copy">Infighting<small>嵌入式 × 边缘计算</small></span>
      </a>
      <div class="nav-actions">
        <nav class="site-nav" aria-label="主导航">
          <a href="../index.html">首页</a>
          <a href="../tags.html">标签</a>
          <a href="../archive.html">精选归档</a>
        </nav>
        <button class="theme-toggle" type="button" data-theme-toggle aria-label="切换到浅色主题" aria-pressed="false">
          <span class="theme-icon theme-icon-sun" aria-hidden="true">☼</span>
          <span class="theme-icon theme-icon-moon" aria-hidden="true">☾</span>
        </button>
      </div>
    </div>
  </header>
  <main class="container">
    <a class="back-link" href="../index.html">&larr; 返回文章列表</a>
    <article class="article glass-surface">
      <header class="article-header">
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta"><span>${escapeHtml(post.date)}</span>${tags}</div>
      </header>
      ${toc}
      <div class="article-body">${articleHtml}</div>
${articleNavigation ? `      ${articleNavigation}\n` : ''}    </article>
  </main>
  <footer class="site-footer">© Infighting | 嵌入式与边缘计算开发笔记</footer>
</body>
</html>
`;
}

module.exports = { renderArticlePage };
