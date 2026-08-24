'use strict';

function selectorMatches(element, selector) {
  if (selector.startsWith('.')) {
    return element.classList.contains(selector.slice(1));
  }
  if (selector.startsWith('[') && selector.endsWith(']')) {
    const content = selector.slice(1, -1);
    const separator = content.indexOf('=');
    if (separator === -1) return element.getAttribute(content) !== null;
    const name = content.slice(0, separator);
    const expected = content.slice(separator + 1).replace(/^['"]|['"]$/g, '');
    return element.getAttribute(name) === expected;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return (this.element.attributes.class || '').split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this.values().includes(name);
  }

  add(...names) {
    this.element.attributes.class = [...new Set([...this.values(), ...names])].join(' ');
  }

  remove(...names) {
    this.element.attributes.class = this.values()
      .filter((name) => !names.includes(name))
      .join(' ');
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this.classList = new FakeClassList(this);
    this._text = '';
    this.disabled = false;
  }

  set className(value) {
    this.attributes.class = String(value);
  }

  get className() {
    return this.attributes.class || '';
  }

  set textContent(value) {
    this._text = String(value == null ? '' : value);
    this.children = [];
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'disabled') this.disabled = true;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'disabled') this.disabled = false;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  querySelectorAll(selector) {
    const matches = [];
    this.children.forEach((child) => {
      if (selectorMatches(child, selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    });
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createElementNS(namespace, tagName) {
    return new FakeElement(tagName);
  }

  getElementById(id) {
    return this.body.querySelectorAll('[id]').find((element) => element.getAttribute('id') === id) || null;
  }

  querySelectorAll(selector) {
    if (selector === '.site-nav a') {
      const links = [];
      this.body.querySelectorAll('.site-nav').forEach((nav) => links.push(...nav.querySelectorAll('a')));
      return links;
    }
    return this.body.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

module.exports = { FakeDocument, FakeElement };
