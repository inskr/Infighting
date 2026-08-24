'use strict';

const { escapeXml } = require('./output-encoding');

function articleUrl(siteUrl, id) {
  return `${siteUrl}posts/${encodeURIComponent(id)}.html`;
}

function comparePostsByDiscoveryOrder(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function staticPosts(posts) {
  return posts.filter((post) => post.type === 'post').sort(comparePostsByDiscoveryOrder);
}

function rssDate(date) {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

function renderSitemap({ posts, siteUrl }) {
  const pageUrls = ['', 'tags.html', 'archive.html', 'search.html']
    .map(
      (relativePath) =>
        `  <url>\n    <loc>${escapeXml(`${siteUrl}${relativePath}`)}</loc>\n  </url>`
    );
  const articleUrls = staticPosts(posts)
    .map(
      (post) =>
        `  <url>\n    <loc>${escapeXml(articleUrl(siteUrl, post.id))}</loc>\n    <lastmod>${escapeXml(post.date)}</lastmod>\n  </url>`
    );
  const urls = pageUrls.concat(articleUrls).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function renderRss({ posts, siteUrl }) {
  const items = staticPosts(posts)
    .map((post) => {
      const url = articleUrl(siteUrl, post.id);
      const categories = (Array.isArray(post.tags) ? post.tags : [])
        .map((tag) => `      <category>${escapeXml(tag)}</category>`)
        .join('\n');
      return `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${escapeXml(url)}</link>\n      <guid isPermaLink="true">${escapeXml(url)}</guid>\n      <pubDate>${escapeXml(rssDate(post.date))}</pubDate>\n      <description>${escapeXml(post.summary || post.title)}</description>${categories ? `\n${categories}` : ''}\n    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Infighting</title>\n    <link>${escapeXml(siteUrl)}</link>\n    <description>嵌入式与边缘计算开发笔记</description>\n${items}\n  </channel>\n</rss>\n`;
}

module.exports = { renderRss, renderSitemap };
