'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const marked = require('../public/vendor/marked.min.js');
const ContentCards = require('../public/assets/js/content-cards.js');
const PostLoader = require('../public/assets/js/post-loader.js');
const PostView = require('../public/assets/js/post-view.js');
const SiteShell = require('../public/assets/js/site-shell.js');

const mainSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'assets', 'js', 'main.js'),
  'utf8'
);

function fullPost(id = 'alpha') {
  return {
    id,
    title: id === 'alpha' ? 'Alpha article' : 'Other article',
    date: '2026-08-11',
    tags: ['testing'],
    summary: 'Fixture post',
    type: 'post',
    content: '![diagram](diagram.png)\n\n# Body'
  };
}

function fakeImage(events) {
  return {
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
      events.push(`decorate:${name}`);
    }
  };
}

async function renderArticle({ id = 'alpha', posts = [fullPost('alpha')], fetch }) {
  const events = [];
  const images = [fakeImage(events)];
  const article = {
    html: '',
    get innerHTML() {
      return this.html;
    },
    set innerHTML(value) {
      this.html = value;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.article-body img' && this.html.includes('<img')) return images;
      return [];
    }
  };
  const reportViewCalls = [];
  const fetchStatsCalls = [];
  const statsCache = Object.create(null);
  const Stats = {
    getCache() {
      return statsCache;
    },
    formatCount(value) {
      return String(value);
    },
    reportView(postId) {
      events.push('reportView');
      reportViewCalls.push(postId);
      return Promise.resolve(1);
    },
    fetchStats(postId) {
      events.push('fetchStats');
      fetchStatsCalls.push(postId);
      return Promise.resolve({ viewCount: 1, likeCount: 0 });
    }
  };
  const document = {
    title: '',
    documentElement: { clientHeight: 844 },
    getElementById(elementId) {
      return elementId === 'article' ? article : null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    createElement() {
      throw new Error('no table wrappers expected in this fixture');
    }
  };
  const fetchCalls = [];
  const window = {
    POSTS: posts,
    ContentCards,
    document,
    PostLoader,
    PostView,
    SiteShell,
    Stats,
    LikesStorage: { hasLiked() { return false; } },
    location: { search: `?id=${encodeURIComponent(id)}` },
    fetch: async (url) => {
      fetchCalls.push(url);
      return fetch(url);
    },
    addEventListener() {}
  };

  vm.runInNewContext(mainSource, {
    URLSearchParams,
    document,
    encodeURIComponent,
    hljs: { highlightElement() {} },
    marked,
    setTimeout,
    window
  });

  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();

  return {
    article,
    document,
    events,
    fetchCalls,
    fetchStatsCalls,
    images,
    reportViewCalls
  };
}

test('unindexed IDs render recovery UI without fetching or reporting a view', async () => {
  const result = await renderArticle({
    id: 'orphan',
    posts: [fullPost('alpha')],
    fetch: async () => ({ ok: true, json: async () => fullPost('orphan') })
  });

  assert.deepEqual(result.fetchCalls, []);
  assert.deepEqual(result.reportViewCalls, []);
  assert.deepEqual(result.fetchStatsCalls, []);
  assert.match(result.article.html, /文章不存在/);
  assert.match(result.article.html, /href="index\.html"/);
});

test('loader failures render recovery UI without reporting a view', async () => {
  const result = await renderArticle({
    fetch: async () => ({ ok: false, status: 503 })
  });

  assert.deepEqual(result.fetchCalls, ['assets/posts/alpha.json']);
  assert.deepEqual(result.reportViewCalls, []);
  assert.deepEqual(result.fetchStatsCalls, []);
  assert.match(result.article.html, /文章加载失败/);
  assert.match(result.article.html, /href="index\.html"/);
});

test('mismatched article documents fail before rendering or reporting', async () => {
  const result = await renderArticle({
    fetch: async () => ({ ok: true, json: async () => fullPost('beta') })
  });

  assert.deepEqual(result.reportViewCalls, []);
  assert.deepEqual(result.fetchStatsCalls, []);
  assert.match(result.article.html, /文章加载失败/);
  assert.doesNotMatch(result.article.html, /Other article/);
});

test('malformed article documents fail before rendering or reporting', async () => {
  const malformed = fullPost('alpha');
  malformed.title = null;
  const result = await renderArticle({
    fetch: async () => ({ ok: true, json: async () => malformed })
  });

  assert.deepEqual(result.reportViewCalls, []);
  assert.deepEqual(result.fetchStatsCalls, []);
  assert.match(result.article.html, /文章加载失败/);
  assert.doesNotMatch(result.article.html, /undefined|Alpha article/);
});

test('successful article rendering decorates images before reporting the view', async () => {
  const result = await renderArticle({
    fetch: async () => ({ ok: true, json: async () => fullPost('alpha') })
  });

  assert.deepEqual(result.fetchCalls, ['assets/posts/alpha.json']);
  assert.match(result.article.html, /Alpha article/);
  assert.match(result.article.html, /<h1>Body<\/h1>/);
  assert.deepEqual(result.images[0].attributes, {
    loading: 'lazy',
    decoding: 'async'
  });
  assert.deepEqual(result.events, [
    'decorate:loading',
    'decorate:decoding',
    'reportView',
    'fetchStats'
  ]);
  assert.deepEqual(result.reportViewCalls, ['alpha']);
  assert.deepEqual(result.fetchStatsCalls, ['alpha']);
});

test('transitional runtime does not retain legacy article URLs', () => {
  assert.doesNotMatch(mainSource, /post\.html\?id=/);
});
