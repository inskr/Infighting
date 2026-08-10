'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let Effects = {};
try {
  Effects = require('../public/assets/js/ui-effects');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

test('spotlight position is relative to the card and clamped to its bounds', () => {
  assert.equal(typeof Effects.calculateSpotlightPosition, 'function');
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.deepEqual(Effects.calculateSpotlightPosition(rect, 150, 75), { x: 25, y: 25 });
  assert.deepEqual(Effects.calculateSpotlightPosition(rect, 20, 300), { x: 0, y: 100 });
});

test('pointer movement updates CSS coordinates on the real glass surface target', () => {
  assert.equal(typeof Effects.createSpotlightController, 'function');
  const listeners = {};
  const values = {};
  const surface = {
    getBoundingClientRect() {
      return { left: 100, top: 50, width: 200, height: 100 };
    },
    style: {
      setProperty(name, value) {
        values[name] = value;
      },
    },
  };
  const root = {
    matchMedia() {
      return { matches: false };
    },
    document: {
      addEventListener(name, handler) {
        listeners[name] = handler;
      },
    },
  };
  const controller = Effects.createSpotlightController(root);
  assert.equal(controller.bind(), true);

  listeners.pointermove({
    clientX: 150,
    clientY: 75,
    target: { closest() { return surface; } },
  });

  assert.equal(values['--pointer-x'], '25%');
  assert.equal(values['--pointer-y'], '25%');
});

test('coarse pointers and reduced-motion users do not bind spotlight tracking', () => {
  let listeners = 0;
  const root = {
    matchMedia(query) {
      return { matches: query === '(pointer: coarse)' };
    },
    document: {
      addEventListener() {
        listeners += 1;
      },
    },
  };
  assert.equal(Effects.createSpotlightController(root).bind(), false);
  assert.equal(listeners, 0);
});
