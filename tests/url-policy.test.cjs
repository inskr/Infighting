'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { safeExternalUrl } = require('../public/assets/js/url-policy');

test('external feed links only allow credential-free HTTP(S) URLs', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), '');
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safeExternalUrl('https://user:secret@example.com/path'), '');
  assert.equal(safeExternalUrl('//example.com/path'), '');
  assert.equal(safeExternalUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeExternalUrl('http://example.com/path'), 'http://example.com/path');
});
