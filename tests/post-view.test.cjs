'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const PostView = require('../public/assets/js/post-view.js');

function fakeImage() {
  return {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

test('renders a readable load failure with a return link', () => {
  const html = PostView.errorCardHtml({ code: 'LOAD_FAILED' });

  assert.match(html, /文章加载失败/);
  assert.match(html, /href="index\.html"/);
  assert.match(html, /返回文章列表/);
});

test('renders a missing article distinctly with the shared return link', () => {
  const html = PostView.errorCardHtml({ code: 'NOT_FOUND' });

  assert.match(html, /文章不存在/);
  assert.match(html, /href="index\.html"/);
  assert.match(html, /返回文章列表/);
});

test('renders unknown errors as load failures rather than missing articles', () => {
  const html = PostView.errorCardHtml(new Error('unexpected'));

  assert.match(html, /文章加载失败/);
  assert.doesNotMatch(html, /文章不存在/);
});

test('decorates every rendered article image for deferred decoding', () => {
  const images = [fakeImage(), fakeImage()];

  const count = PostView.decorateArticleImages({ querySelectorAll: () => images });

  assert.equal(count, 2);
  assert.deepEqual(images[0].attributes, { loading: 'lazy', decoding: 'async' });
  assert.deepEqual(images[1].attributes, { loading: 'lazy', decoding: 'async' });
});
