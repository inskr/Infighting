'use strict';

const { marked } = require('marked');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderArticlePage({ post, posts, siteUrl }) {
  void posts;
  void siteUrl;

  const articleHtml = marked.parse(post.content);
  const tags = post.tags
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');

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
      <div class="article-body">${articleHtml}</div>
    </article>
  </main>
  <footer class="site-footer">© Infighting | 嵌入式与边缘计算开发笔记</footer>
</body>
</html>
`;
}

module.exports = { renderArticlePage };
