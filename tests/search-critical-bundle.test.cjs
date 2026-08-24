'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

let SearchCriticalBundle;
try {
  SearchCriticalBundle = require('../scripts/search-critical-bundle.js');
} catch (error) {
  SearchCriticalBundle = { loadError: error };
}

function api() {
  assert.equal(
    SearchCriticalBundle.loadError,
    undefined,
    'Search critical bundle generator should load'
  );
  return SearchCriticalBundle;
}

test('extracts marked declarations deterministically and restores responsive wrappers', () => {
  // Break caught: a CSS move drops a critical fragment, leaks markers, or loses its media condition.
  const lf = [
    '/* ordinary */',
    '/* search-critical:start */',
    '.alpha { color: red; }',
    '/* search-critical:end */',
    '@media (max-width: 680px) {',
    '  /* search-critical:start media=(max-width: 680px) */',
    '  .alpha { display: block; }',
    '',
    '  .beta { display: none; }',
    '  /* search-critical:end */',
    '}',
    '',
  ].join('\n');
  const expected = [
    '/* Auto-generated from assets/css/style.css search-critical markers. */',
    '.alpha { color: red; }',
    '@media (max-width: 680px) {',
    '  .alpha { display: block; }',
    '',
    '  .beta { display: none; }',
    '}',
    '',
  ].join('\n');

  assert.equal(api().renderSearchCriticalCss(lf), expected);
  assert.equal(api().renderSearchCriticalCss(lf.replace(/\n/g, '\r\n')), expected);
  assert.doesNotMatch(expected, /search-critical:(?:start|end)/);
});

test('rejects missing, nested, and unpaired critical markers instead of publishing partial CSS', () => {
  // Break caught: malformed marker maintenance silently emits an incomplete first paint.
  assert.throws(() => api().renderSearchCriticalCss('.alpha {}'), /no search-critical fragments/i);
  assert.throws(
    () => api().renderSearchCriticalCss('/* search-critical:start */\n/* search-critical:start */'),
    /nested search-critical start/i
  );
  assert.throws(
    () => api().renderSearchCriticalCss('/* search-critical:start */\n.alpha {}'),
    /unclosed search-critical fragment/i
  );
  assert.throws(
    () => api().renderSearchCriticalCss('/* search-critical:end */'),
    /search-critical end without start/i
  );
});

test('normalizes the generated Search theme bundle without changing the source program', () => {
  // Break caught: Search gains a hand-maintained theme fork or platform line endings change CSP bytes.
  const source = '/* controller */\r\n(function () { return "dark"; })();\r\n';
  assert.equal(
    api().renderSearchThemeBundle(source),
    '// Auto-generated from assets/js/theme.js.\n/* controller */\n(function () { return "dark"; })();\n'
  );
  assert.throws(
    () => api().renderSearchThemeBundle('window.value = "</script>";'),
    /cannot contain <\/script/i
  );
});

test('generated critical CSS owns the Search Hero typography and responsive hierarchy', () => {
  // Break caught: the static LCP candidate depends on the delayed enhancement stylesheet.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'assets', 'css', 'style.css'),
    'utf8'
  );
  const critical = api().renderSearchCriticalCss(source);

  assert.match(critical, /\.search-hero\s*\{[^}]*padding:/s);
  assert.match(critical, /\.search-hero \.page-title\s*\{[^}]*font-size:\s*clamp\(/s);
  assert.match(critical, /\.search-hero \.page-desc\s*\{[^}]*font-size:/s);
  assert.match(
    critical,
    /@media \(max-width: 680px\)\s*\{[\s\S]*?\.search-hero \.page-title\s*\{/
  );
});
