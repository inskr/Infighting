'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Effects = require('../public/assets/js/ui-effects.js');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'assets', 'js', 'ui-effects.js'),
  'utf8'
);

function revealTarget(kind, { top = 100, height = 100, descendants = [], operations = null } = {}) {
  const classes = new Set([kind]);
  return {
    nodeType: 1,
    height,
    style: {},
    classList: {
      add(name) {
        if (operations) operations.push(`write:${kind}:${name}`);
        classes.add(name);
      },
      contains(name) { return classes.has(name); },
    },
    getBoundingClientRect() {
      if (operations) operations.push(`read:${kind}`);
      return { top };
    },
    matches(selector) { return selector.includes(`.${kind}`); },
    querySelectorAll(selector) {
      return descendants.filter((node) => node.matches(selector));
    },
    hasClass(name) { return classes.has(name); },
  };
}

function bootstrapFixture(initialTargets) {
  const observed = [];
  const unobserved = [];
  let mutationCallback;

  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.threshold = options.threshold;
    }

    observe(target) {
      observed.push(target);
      const intersectionRatio = Math.min(600, target.height) / target.height;
      const threshold = Array.isArray(this.threshold)
        ? Math.min(...this.threshold)
        : this.threshold;
      if (intersectionRatio >= threshold) {
        this.callback([{ isIntersecting: true, intersectionRatio, target }]);
      }
    }

    unobserve(target) { unobserved.push(target); }
  }

  class FakeMutationObserver {
    constructor(callback) { mutationCallback = callback; }
    observe(target, options) {
      assert.equal(target, root.document.body);
      assert.equal(options.childList, true);
      assert.equal(options.subtree, true);
    }
  }

  const root = {
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: FakeMutationObserver,
    matchMedia() { return { matches: false }; },
    document: {
      body: {},
      documentElement: { clientHeight: 600 },
      addEventListener() {},
      querySelector(selector) {
        if (selector === '[data-motion-hero]' || selector === '[data-signal-field]') return null;
        return null;
      },
      querySelectorAll() { return initialTargets; },
    },
  };

  return {
    observed,
    root,
    unobserved,
    add(...nodes) { mutationCallback([{ addedNodes: nodes }]); },
  };
}

test('loaded effects bootstrap reveals initial tag and tall article surfaces', () => {
  // Break caught: published pages load UiEffects but its bootstrap never owns reveal behavior.
  const tagCloud = revealTarget('tag-cloud');
  const tallArticle = revealTarget('article', { top: 700, height: 50000 });
  const view = bootstrapFixture([tagCloud, tallArticle]);

  vm.runInNewContext(source, { globalThis: view.root });

  assert.equal(tagCloud.hasClass('reveal'), true);
  assert.equal(tagCloud.hasClass('visible'), true);
  assert.equal(tallArticle.hasClass('reveal'), true);
  assert.equal(tallArticle.hasClass('visible'), true);
  assert.deepEqual(view.observed, [tallArticle]);
  assert.deepEqual(view.unobserved, [tallArticle]);
});

test('reveal bootstrap batches every layout read before class and style writes', () => {
  // Break caught: reveal setup alternates class writes and layout reads, forcing layout once per surface.
  const operations = [];
  const hero = revealTarget('hero', { top: 100, operations });
  const article = revealTarget('article', { top: 120, height: 50000, operations });
  const board = revealTarget('board', { top: 900, operations });
  const view = bootstrapFixture([hero, article, board]);

  assert.equal(Effects.createRevealController(view.root).bind(), true);

  const lastRead = operations.reduce((last, operation, index) => (
    operation.startsWith('read:') ? index : last
  ), -1);
  const firstWrite = operations.findIndex((operation) => operation.startsWith('write:'));
  assert.deepEqual(operations.filter((operation) => operation.startsWith('read:')), [
    'read:hero',
    'read:article',
    'read:board',
  ]);
  assert.ok(firstWrite > lastRead, operations.join(', '));
});

test('reveal controller enhances cards and boards added after page rendering', () => {
  // Break caught: async Home/Tags cards and descendant archive boards stay outside the initial effects scan.
  const view = bootstrapFixture([]);
  const controller = Effects.createRevealController(view.root);
  assert.equal(controller.bind(), true);
  const card = revealTarget('post-card', { top: 800 });
  const board = revealTarget('board', { top: 900 });
  const wrapper = revealTarget('render-batch', { descendants: [board] });

  view.add(card, wrapper);

  assert.equal(card.hasClass('reveal'), true);
  assert.equal(card.hasClass('visible'), true);
  assert.equal(board.hasClass('reveal'), true);
  assert.equal(board.hasClass('visible'), true);
  assert.deepEqual(view.observed, [card, board]);
});

test('non-animating environments leave reveal surfaces unhidden', () => {
  // Break caught: adding reveal classes without a usable observer hides content permanently.
  for (const mode of ['missing-observer', 'reduced-motion']) {
    const target = revealTarget('hero');
    let observers = 0;
    const root = {
      IntersectionObserver: mode === 'missing-observer' ? undefined : class {
        constructor() { observers += 1; }
      },
      matchMedia(query) {
        return { matches: mode === 'reduced-motion' && query === '(prefers-reduced-motion: reduce)' };
      },
      document: {
        body: {},
        documentElement: { clientHeight: 600 },
        querySelectorAll() { return [target]; },
      },
    };

    assert.equal(Effects.createRevealController(root).bind(), false, mode);
    assert.equal(target.hasClass('reveal'), false, mode);
    assert.equal(observers, 0, mode);
  }
});
