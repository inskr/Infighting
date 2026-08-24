'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ContentCards = require('../public/assets/js/content-cards.js');
const SiteShell = require('../public/assets/js/site-shell.js');

test('a very tall article becomes visible when it intersects the viewport', () => {
  const classes = new Set();
  const article = {
    height: 50000,
    getBoundingClientRect() {
      return { top: 700 };
    },
    classList: {
      add(name) {
        classes.add(name);
      }
    },
    style: {}
  };

  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.threshold = options.threshold;
    }

    observe(target) {
      const intersectionRatio = Math.min(600, target.height) / target.height;
      const threshold = Array.isArray(this.threshold)
        ? Math.min(...this.threshold)
        : this.threshold;

      if (intersectionRatio >= threshold) {
        this.callback([
          {
            isIntersecting: true,
            intersectionRatio,
            target
          }
        ]);
      }
    }

    unobserve() {}
  }

  const document = {
    documentElement: { clientHeight: 600 },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('.article')) {
        return [article];
      }
      return [];
    }
  };
  const window = {
    ContentCards,
    document,
    IntersectionObserver: FakeIntersectionObserver,
    POSTS: [],
    SiteShell,
    addEventListener() {},
    location: { search: '' }
  };
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'assets', 'js', 'main.js'),
    'utf8'
  );

  vm.runInNewContext(source, {
    URLSearchParams,
    document,
    encodeURIComponent,
    IntersectionObserver: FakeIntersectionObserver,
    setTimeout,
    window
  });

  assert.equal(classes.has('reveal'), true);
  assert.equal(classes.has('visible'), true);
});
