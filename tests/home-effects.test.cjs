'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const HomeEffects = require('../public/assets/js/home-effects');

test('homepage animation controllers and their helpers are owned by HomeEffects', () => {
  assert.equal(typeof HomeEffects.init, 'function');
  assert.equal(typeof HomeEffects.createParticleLayout, 'function');
  assert.equal(typeof HomeEffects.stepSpring, 'function');
  assert.equal(typeof HomeEffects.createHeroMotionController, 'function');
  assert.equal(typeof HomeEffects.createSignalFieldController, 'function');
});

test('particle layout scales with area but respects its performance cap', () => {
  const layout = HomeEffects.createParticleLayout(1200, 800, {
    areaPerParticle: 4000,
    maxParticles: 48,
    random: () => 0.5,
  });
  assert.equal(layout.length, 48);
  assert.deepEqual(layout[0], { x: 600, y: 400, vx: 0, vy: 0, radius: 1.25 });
});

test('spring integration moves toward its target without snapping', () => {
  const first = HomeEffects.stepSpring(
    { position: 0, velocity: 0 },
    10,
    { stiffness: 0.12, damping: 0.8 }
  );
  assert.deepEqual(first, { position: 0.96, velocity: 0.96 });
  assert.ok(first.position > 0 && first.position < 10);
});

test('hero motion controller converts pointer input into spring-driven CSS coordinates', () => {
  const listeners = {};
  const frames = [];
  const values = {};
  const hero = {
    addEventListener(name, handler) { listeners[name] = handler; },
    getBoundingClientRect() { return { left: 100, top: 50, width: 400, height: 200 }; },
    style: { setProperty(name, value) { values[name] = value; } },
  };
  const root = {
    matchMedia() { return { matches: false }; },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
    document: { querySelector(selector) { return selector === '[data-motion-hero]' ? hero : null; } },
  };
  assert.equal(HomeEffects.createHeroMotionController(root).bind(), true);
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
      getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 200 }; },
      style: { setProperty(name, value) { values[name] = value; } },
    };
    const root = {
      matchMedia() { return { matches: false, addEventListener() {} }; },
      requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
      cancelAnimationFrame() {},
      document: { querySelector() { return hero; } },
    };
    HomeEffects.createHeroMotionController(root).bind();
    listeners.pointermove({ clientX: 400, clientY: 100, pointerType: 'mouse' });
    const samples = Math.round(duration / frameInterval);
    for (let index = 0; index <= samples && frames.length; index += 1) frames.shift()(index * frameInterval);
    return Number.parseFloat(values['--motion-x']);
  }
  const at60Hz = positionAfter(1000 / 60, 200);
  const at120Hz = positionAfter(1000 / 120, 200);
  assert.ok(Math.abs(at60Hz - at120Hz) < 0.2, `${at60Hz} vs ${at120Hz}`);
});

test('enabling reduced motion cancels an active hero animation frame', () => {
  const listeners = {};
  const media = {};
  const cancelled = [];
  const values = {};
  const hero = {
    addEventListener(name, handler) { listeners[name] = handler; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 200 }; },
    style: { setProperty(name, value) { values[name] = value; } },
  };
  const root = {
    matchMedia(query) {
      if (!media[query]) media[query] = { matches: false, addEventListener(name, handler) { this.handler = handler; } };
      return media[query];
    },
    requestAnimationFrame() { return 17; },
    cancelAnimationFrame(id) { cancelled.push(id); },
    document: { querySelector() { return hero; } },
  };
  assert.equal(HomeEffects.createHeroMotionController(root).bind(), true);
  listeners.pointermove({ clientX: 400, clientY: 100, pointerType: 'mouse' });
  media['(prefers-reduced-motion: reduce)'].matches = true;
  media['(prefers-reduced-motion: reduce)'].handler();
  assert.deepEqual(cancelled, [17]);
  assert.equal(values['--motion-x'], '0px');
  assert.equal(values['--motion-y'], '0px');
});

test('simple-effect preferences skip Canvas, pointer listeners, and animation frames', () => {
  // Break caught: coarse pointers or reduced-motion users pay setup cost before effects are disabled.
  for (const preferredQuery of ['(pointer: coarse)', '(prefers-reduced-motion: reduce)']) {
    let contexts = 0;
    let bindings = 0;
    let frames = 0;
    const hero = { addEventListener() { bindings += 1; } };
    const canvas = {
      getContext() { contexts += 1; return {}; },
      addEventListener() { bindings += 1; },
    };
    const root = {
      matchMedia(query) { return { matches: query === preferredQuery, addEventListener() {} }; },
      requestAnimationFrame() { frames += 1; return frames; },
      document: {
        querySelector(selector) {
          if (selector === '[data-motion-hero]') return hero;
          if (selector === '[data-signal-field]') return canvas;
          return null;
        },
      },
    };

    assert.equal(HomeEffects.init(root), false, preferredQuery);
    assert.equal(contexts, 0, preferredQuery);
    assert.equal(bindings, 0, preferredQuery);
    assert.equal(frames, 0, preferredQuery);
  }
});

test('homepage loads its dedicated effect module and published pages do not reference main.js', () => {
  const publicDir = path.join(__dirname, '..', 'public');
  const home = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(home, /assets\/js\/home-effects\.js/);

  for (const filename of [
    ...fs.readdirSync(publicDir).filter((name) => name.endsWith('.html')).map((name) => path.join(publicDir, name)),
    ...fs.readdirSync(path.join(publicDir, 'posts')).filter((name) => name.endsWith('.html')).map((name) => path.join(publicDir, 'posts', name)),
  ]) {
    assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /(?:assets\/js\/)?main\.js/);
  }
});
