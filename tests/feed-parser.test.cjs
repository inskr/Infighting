'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseFeed } = require('../scripts/fetch-feeds');

test('feed parser drops unsafe link protocols before generated data is written', () => {
  const xml = `
    <rss><channel>
      <item>
        <title>Unsafe JavaScript</title>
        <link>javascript:alert(1)</link>
        <pubDate>Wed, 29 Jul 2026 00:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Unsafe credentials</title>
        <link>https://user:secret@example.com/story</link>
        <pubDate>Wed, 29 Jul 2026 00:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Safe story</title>
        <link>https://example.com/story</link>
        <pubDate>Wed, 29 Jul 2026 00:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;

  const items = parseFeed(xml, 'Fixture');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Safe story');
  assert.equal(items[0].link, 'https://example.com/story');
});
