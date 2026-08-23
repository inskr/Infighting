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
      documentElement: {
        style: {
          setProperty(name, value) {
            values[name] = value;
          },
        },
      },
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
  assert.equal(values['--ambient-x'], '150px');
  assert.equal(values['--ambient-y'], '75px');
});

test('touch pointer movement does not update spotlight coordinates', () => {
  const listeners = {};
  const values = {};
  const surface = {
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
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
  assert.equal(Effects.createSpotlightController(root).bind(), true);

  listeners.pointermove({
    pointerType: 'touch',
    clientX: 50,
    clientY: 50,
    target: { closest() { return surface; } },
  });

  assert.deepEqual(values, {});
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

test('spring integration moves toward its target without snapping', () => {
  assert.equal(typeof Effects.stepSpring, 'function');
  const first = Effects.stepSpring(
    { position: 0, velocity: 0 },
    10,
    { stiffness: 0.12, damping: 0.8 }
  );
  assert.deepEqual(first, { position: 0.96, velocity: 0.96 });
  assert.ok(first.position > 0 && first.position < 10);
});

test('particle layout scales with area but respects its performance cap', () => {
  assert.equal(typeof Effects.createParticleLayout, 'function');
  const layout = Effects.createParticleLayout(1200, 800, {
    areaPerParticle: 4000,
    maxParticles: 48,
    random: () => 0.5,
  });
  assert.equal(layout.length, 48);
  assert.deepEqual(layout[0], {
    x: 600,
    y: 400,
    vx: 0,
    vy: 0,
    radius: 1.25,
  });
});

test('hero motion controller converts pointer input into spring-driven CSS coordinates', () => {
  assert.equal(typeof Effects.createHeroMotionController, 'function');
  const listeners = {};
  const frames = [];
  const values = {};
  const hero = {
    addEventListener(name, handler) { listeners[name] = handler; },
    getBoundingClientRect() {
      return { left: 100, top: 50, width: 400, height: 200 };
    },
    style: {
      setProperty(name, value) { values[name] = value; },
    },
  };
  const root = {
    matchMedia() { return { matches: false }; },
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame() {},
    document: {
      querySelector(selector) {
        return selector === '[data-motion-hero]' ? hero : null;
      },
    },
  };

  const controller = Effects.createHeroMotionController(root);
  assert.equal(controller.bind(), true);
  listeners.pointermove({ clientX: 500, clientY: 150, pointerType: 'mouse' });
  frames.shift()(16);

  assert.equal(values['--motion-x'], '1.44px');
  assert.equal(values['--motion-y'], '0.00px');
});

test('hero spring reaches the same position over equal time at 60Hz and 120Hz', () => {
  function positionAfter(frameInterval, duration) {
    const listeners = {};
    const frames = [];
    const values = {};
    const hero = {
      addEventListener(name, handler) { listeners[name] = handler; },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 400, height: 200 };
      },
      style: { setProperty(name, value) { values[name] = value; } },
    };
    const root = {
      matchMedia() { return { matches: false, addEventListener() {} }; },
      requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
      cancelAnimationFrame() {},
      document: { querySelector() { return hero; } },
    };
    Effects.createHeroMotionController(root).bind();
    listeners.pointermove({ clientX: 400, clientY: 100, pointerType: 'mouse' });
    const samples = Math.round(duration / frameInterval);
    for (let index = 0; index <= samples && frames.length; index += 1) {
      frames.shift()(index * frameInterval);
    }
    return Number.parseFloat(values['--motion-x']);
  }

  const at60Hz = positionAfter(1000 / 60, 200);
  const at120Hz = positionAfter(1000 / 120, 200);
  assert.ok(Math.abs(at60Hz - at120Hz) < 0.2, `${at60Hz} vs ${at120Hz}`);
});

test('hero motion stays dormant on devices without hover', () => {
  let pointerListeners = 0;
  const hero = {
    addEventListener() { pointerListeners += 1; },
  };
  const root = {
    matchMedia(query) {
      return { matches: query === '(hover: none)', addEventListener() {} };
    },
    document: { querySelector() { return hero; } },
  };

  assert.equal(Effects.createHeroMotionController(root).bind(), false);
  assert.equal(pointerListeners, 0);
});

test('enabling reduced motion cancels an active hero animation frame', () => {
  const listeners = {};
  const media = {};
  const cancelled = [];
  const values = {};
  const hero = {
    addEventListener(name, handler) { listeners[name] = handler; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 400, height: 200 };
    },
    style: { setProperty(name, value) { values[name] = value; } },
  };
  const root = {
    matchMedia(query) {
      if (!media[query]) {
        media[query] = {
          matches: false,
          addEventListener(name, handler) { this.handler = handler; },
        };
      }
      return media[query];
    },
    requestAnimationFrame() { return 17; },
    cancelAnimationFrame(id) { cancelled.push(id); },
    document: { querySelector() { return hero; } },
  };

  assert.equal(Effects.createHeroMotionController(root).bind(), true);
  listeners.pointermove({ clientX: 400, clientY: 100, pointerType: 'mouse' });
  media['(prefers-reduced-motion: reduce)'].matches = true;
  media['(prefers-reduced-motion: reduce)'].handler();

  assert.deepEqual(cancelled, [17]);
  assert.equal(values['--motion-x'], '0px');
  assert.equal(values['--motion-y'], '0px');
});
