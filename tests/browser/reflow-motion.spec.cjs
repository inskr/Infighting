'use strict';

const { test, expect } = require('@playwright/test');

const routes = [
  { name: 'home', path: '/' },
  { name: 'search', path: '/search.html' },
  { name: 'tags', path: '/tags.html' },
  { name: 'archive', path: '/archive.html' },
  { name: 'article', path: '/posts/embedded-robotics-learning-roadmap.html' },
];

const layouts = [
  { name: '320px', viewport: { width: 320, height: 800 }, zoom: 1 },
  { name: '200%-zoom-equivalent', viewport: { width: 640, height: 800 }, zoom: 2 },
];

async function applyLayout(page, layout) {
  await page.setViewportSize(layout.viewport);
  if (layout.zoom !== 1) {
    await page.evaluate((zoom) => {
      document.documentElement.style.zoom = String(zoom);
    }, layout.zoom);
  }
}

async function reflowDiagnostics(page) {
  return page.evaluate(() => {
    const bodyOverflowX = getComputedStyle(document.body).overflowX;
    document.body.style.setProperty('overflow-x', 'visible', 'important');
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const allowedInternalOverflow = '.article-body pre, .article-body .table-wrapper';
    const label = (element) => {
      const id = element.id ? `#${element.id}` : '';
      const classes = typeof element.className === 'string' && element.className.trim()
        ? `.${element.className.trim().split(/\s+/).join('.')}`
        : '';
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const visibleElements = [...document.body.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    const internalOverflow = visibleElements
      .filter((element) => {
        const overflowX = getComputedStyle(element).overflowX;
        return (overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1;
      })
      .filter((element) => !element.matches(allowedInternalOverflow))
      .map(label);
    const boundsOverflow = visibleElements
      .filter((element) => {
        if (element.matches(allowedInternalOverflow)) return false;
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .map(label)
      .slice(0, 20);
    return {
      bodyOverflowX,
      boundsOverflow,
      clientWidth: viewportWidth,
      internalOverflow,
      scrollWidth: root.scrollWidth,
    };
  });
}

async function undersizedTargets(page, zoom) {
  return page.evaluate((scale) => {
    const selector = [
      '.site-nav a',
      '.theme-toggle',
      '.pagination a',
      '.search-controls input',
      '.search-controls button',
      'a.tag',
      '.tag-cloud a',
      '.like-btn:not([disabled])',
    ].join(', ');
    return [...document.querySelectorAll(selector)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          target: element.matches('input') ? `input#${element.id}` : element.outerHTML.slice(0, 100),
          width: Math.round((rect.width / scale) * 100) / 100,
          height: Math.round((rect.height / scale) * 100) / 100,
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44);
  }, zoom);
}

for (const layout of layouts) {
  for (const route of routes) {
    test(`${route.name} reflows without document overflow at ${layout.name}`, async ({ page }) => {
      // Break caught: a real page child widens the document, including when body clipping masks it.
      await page.goto(route.path);
      await applyLayout(page, layout);
      const diagnostics = await reflowDiagnostics(page);
      expect(diagnostics.bodyOverflowX, JSON.stringify(diagnostics, null, 2)).not.toBe('hidden');
      expect(diagnostics.scrollWidth, JSON.stringify(diagnostics, null, 2)).toBeLessThanOrEqual(diagnostics.clientWidth);
      expect(diagnostics.internalOverflow, JSON.stringify(diagnostics, null, 2)).toEqual([]);
    });

    test(`${route.name} visible interactive targets are at least 44px at ${layout.name}`, async ({ page }) => {
      // Break caught: a required navigation, pagination, search, interactive tag, or like target is too small.
      await page.goto(route.path);
      await applyLayout(page, layout);
      await expect.poll(() => undersizedTargets(page, layout.zoom)).toEqual([]);
    });
  }
}

test('reduced motion skips animation work, reveals content, and paginates without smooth scrolling', async ({ page }) => {
  // Break caught: reduced motion still initializes Canvas/Hero frames, hides reveals, or smooth-scrolls pagination.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__motionWork = { canvasContexts: 0, frames: 0, pointerBindings: 0, scrolls: [] };
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function observedGetContext(...args) {
      window.__motionWork.canvasContexts += 1;
      return nativeGetContext.apply(this, args);
    };
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = function observedAnimationFrame(callback) {
      window.__motionWork.frames += 1;
      return nativeRequestAnimationFrame.call(this, callback);
    };
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function observedListener(type, listener, options) {
      if (type === 'pointermove' || type === 'pointerleave') window.__motionWork.pointerBindings += 1;
      return nativeAddEventListener.call(this, type, listener, options);
    };
    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function observedScroll(options) {
      window.__motionWork.scrolls.push(options || {});
      return nativeScrollIntoView.call(this, options);
    };
  });
  await page.goto('/');
  await expect(page.locator('.post-card').first()).toBeVisible();
  const revealStyles = await page.locator('.hero, .post-card, .board').evaluateAll((elements) => (
    elements.map((element) => ({
      opacity: getComputedStyle(element).opacity,
      transform: getComputedStyle(element).transform,
    }))
  ));
  expect(revealStyles.every(({ opacity, transform }) => opacity === '1' && transform === 'none')).toBe(true);

  const pageTwo = page.locator('.pagination a').filter({ hasText: /^2$/ });
  await expect(pageTwo).toBeVisible();
  await pageTwo.click();
  await expect.poll(() => page.evaluate(() => window.__motionWork.scrolls)).toEqual([
    { behavior: 'auto', block: 'start' },
  ]);
  expect(await page.evaluate(() => ({
    canvasContexts: window.__motionWork.canvasContexts,
    frames: window.__motionWork.frames,
    pointerBindings: window.__motionWork.pointerBindings,
  }))).toEqual({ canvasContexts: 0, frames: 0, pointerBindings: 0 });
});
