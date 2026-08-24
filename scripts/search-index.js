'use strict';

const { marked } = require('marked');

function markdownToPlainText(markdown) {
  const renderer = new marked.Renderer();
  const inlineRenderer = new marked.TextRenderer();
  inlineRenderer.html = () => '';
  const inlineText = (tokens) => renderer.parser.parseInline(tokens, inlineRenderer);

  renderer.space = () => '';
  renderer.hr = () => '\n';
  renderer.heading = ({ tokens }) => `${inlineText(tokens)}\n`;
  renderer.paragraph = ({ tokens }) => `${inlineText(tokens)}\n`;
  renderer.code = ({ text }) => `${text}\n`;
  renderer.blockquote = ({ tokens }) => renderer.parser.parse(tokens);
  renderer.list = ({ items }) => items.map((item) => renderer.listitem(item)).join('');
  renderer.listitem = ({ tokens }) => renderer.parser.parse(tokens);
  renderer.table = ({ header, rows }) =>
    [header, ...rows]
      .map((row) => row.map((cell) => inlineText(cell.tokens)).join(' '))
      .join('\n') + '\n';
  renderer.html = () => '';
  renderer.def = () => '';
  renderer.text = ({ tokens, text }) => `${tokens ? inlineText(tokens) : text}\n`;

  return marked
    .parse(String(markdown || ''), { renderer })
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function createSearchIndex(posts) {
  return posts
    .filter((post) => post.type !== 'page')
    .map((post) => ({
      id: post.id,
      title: post.title,
      summary: post.summary,
      tags: post.tags,
      date: post.date,
      url: `posts/${encodeURIComponent(post.id)}.html`,
      body: markdownToPlainText(post.content),
    }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
}

module.exports = { createSearchIndex };
