'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let Theme = {};
try {
  Theme = require('../public/assets/js/theme');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

function fixture(savedTheme) {
  const attrs = {};
  const listeners = {};
  const stylesheetListeners = {};
  const stylesheet = {
    media: 'print',
    addEventListener(name, handler) {
      stylesheetListeners[name] = handler;
    },
  };
  const button = {
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    addEventListener(name, handler) {
      listeners[name] = handler;
    },
  };
  const document = {
    readyState: 'complete',
    documentElement: {
      setAttribute(name, value) {
        attrs[name] = value;
      },
      getAttribute(name) {
        return attrs[name] || null;
      },
    },
    querySelectorAll(selector) {
      return selector === '[data-theme-toggle]' ? [button] : [];
    },
    querySelector(selector) {
      return selector === 'link[data-enhancement-stylesheet]' ? stylesheet : null;
    },
  };
  const storage = {
    value: savedTheme,
    getItem() {
      return this.value;
    },
    setItem(key, value) {
      this.value = value;
    },
  };
  return {
    root: { document, localStorage: storage },
    attrs,
    button,
    listeners,
    stylesheet,
    stylesheetListeners,
    storage,
  };
}

test('normalizes only dark and light themes', () => {
  assert.equal(typeof Theme.normalizeTheme, 'function');
  assert.equal(Theme.normalizeTheme('dark'), 'dark');
  assert.equal(Theme.normalizeTheme('light'), 'light');
  assert.equal(Theme.normalizeTheme('system'), null);
});

test('defaults to dark and applies a saved light theme', () => {
  assert.equal(typeof Theme.createThemeController, 'function');
  const first = fixture(null);
  assert.equal(Theme.createThemeController(first.root).bootstrap(), 'dark');
  assert.equal(first.attrs['data-theme'], 'dark');

  const saved = fixture('light');
  assert.equal(Theme.createThemeController(saved.root).bootstrap(), 'light');
  assert.equal(saved.attrs['data-theme'], 'light');
});

test('bootstrap activates the Search enhancement stylesheet only after it loads', () => {
  // Break caught: Search either blocks first paint or never applies the full stylesheet after download.
  const state = fixture('light');
  Theme.createThemeController(state.root).bootstrap();

  assert.equal(state.stylesheet.media, 'print');
  assert.equal(typeof state.stylesheetListeners.load, 'function');
  state.stylesheetListeners.load();
  assert.equal(state.stylesheet.media, 'all');
});

test('theme button toggles, persists, and updates its accessible state', () => {
  const state = fixture(null);
  const controller = Theme.createThemeController(state.root);
  controller.bootstrap();
  controller.bind();
  assert.equal(state.button.attrs['aria-pressed'], 'false');
  assert.equal(state.button.attrs['aria-label'], '切换到浅色主题');

  state.listeners.click();

  assert.equal(controller.getTheme(), 'light');
  assert.equal(state.attrs['data-theme'], 'light');
  assert.equal(state.storage.value, 'light');
  assert.equal(state.button.attrs['aria-pressed'], 'true');
  assert.equal(state.button.attrs['aria-label'], '切换到深色主题');
});

test('storage failures do not prevent theme initialization or switching', () => {
  const state = fixture(null);
  state.root.localStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  };
  const controller = Theme.createThemeController(state.root);
  assert.equal(controller.bootstrap(), 'dark');
  assert.doesNotThrow(() => controller.setTheme('light'));
  assert.equal(controller.getTheme(), 'light');
  assert.equal(state.attrs['data-theme'], 'light');
});
