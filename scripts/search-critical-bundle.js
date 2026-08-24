'use strict';

const crypto = require('node:crypto');

const MARKER_PATTERN = /\/\*\s*search-critical:(start|end)(?:\s+media=([^*]+?))?\s*\*\//g;

function normalizeLines(source) {
  return String(source).replace(/\r\n?/g, '\n');
}

function normalizeFragment(source) {
  const lines = normalizeLines(source).split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const indentation = lines
    .filter((line) => line.trim())
    .reduce((lowest, line) => Math.min(lowest, line.match(/^\s*/)[0].length), Infinity);
  if (!Number.isFinite(indentation)) return '';
  return lines.map((line) => line.slice(Math.min(indentation, line.length))).join('\n');
}

function renderSearchCriticalCss(source) {
  const css = normalizeLines(source);
  const fragments = [];
  let open = null;
  let marker;

  MARKER_PATTERN.lastIndex = 0;
  while ((marker = MARKER_PATTERN.exec(css)) !== null) {
    if (marker[1] === 'start') {
      if (open) throw new Error('Nested search-critical start marker');
      open = {
        contentStart: MARKER_PATTERN.lastIndex,
        media: marker[2] ? marker[2].trim() : null,
      };
      continue;
    }

    if (!open) throw new Error('search-critical end without start marker');
    const content = normalizeFragment(css.slice(open.contentStart, marker.index));
    if (!content) throw new Error('Empty search-critical fragment');
    fragments.push({ content, media: open.media });
    open = null;
  }

  if (open) throw new Error('Unclosed search-critical fragment');
  if (fragments.length === 0) throw new Error('No search-critical fragments found');

  const output = fragments.map(({ content, media }) => {
    if (!media) return content;
    const indented = content.split('\n').map((line) => line ? `  ${line}` : '').join('\n');
    return `@media ${media} {\n${indented}\n}`;
  });
  const rendered = [
    '/* Auto-generated from assets/css/style.css search-critical markers. */',
    ...output,
    '',
  ].join('\n');
  if (/<\/style/i.test(rendered)) throw new Error('Search critical CSS cannot contain </style');
  return rendered;
}

function renderSearchThemeBundle(source) {
  const normalized = normalizeLines(source).trim();
  if (!normalized) throw new Error('Search theme source is empty');
  if (/<\/script/i.test(normalized)) throw new Error('Search theme source cannot contain </script');
  return `// Auto-generated from assets/js/theme.js.\n${normalized}\n`;
}

function inlineScriptHash(source) {
  return `sha256-${crypto.createHash('sha256').update(source).digest('base64')}`;
}

module.exports = {
  inlineScriptHash,
  renderSearchCriticalCss,
  renderSearchThemeBundle,
};
