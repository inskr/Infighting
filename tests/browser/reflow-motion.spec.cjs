'use strict';

const { test, expect } = require('@playwright/test');

const routes = [
  { name: 'home', path: '/' },
  { name: 'search', path: '/search.html' },
  { name: 'tags', path: '/tags.html' },
  { name: 'archive', path: '/archive.html' },
  { name: 'article', path: '/posts/embedded-robotics-learning-roadmap.html' },
];

const automatedReflowBoundary = {
  name: '320 CSS px automated reflow equivalent',
  viewport: { width: 320, height: 800 },
};

async function applyAutomatedReflowBoundary(page) {
  await page.setViewportSize(automatedReflowBoundary.viewport);
  const state = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    narrowMediaQuery: window.matchMedia('(max-width: 680px)').matches,
  }));
  expect(state).toEqual({ clientWidth: 320, innerWidth: 320, narrowMediaQuery: true });
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
        // The scroller and its clipped descendants are intentional; reduced motion removes transient entrance transforms.
        if (element.matches(allowedInternalOverflow) || element.closest(allowedInternalOverflow)) return false;
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

async function undersizedTargets(page) {
  return page.evaluate(() => {
    const selector = [
      '.brand',
      '.site-nav a',
      '.theme-toggle',
      '.pagination a',
      '.search-controls input',
      '.search-controls button',
      'a.tag',
      '.tag-cloud a',
      '.like-btn:not([disabled])',
      '.back-link',
      '.article-toc a',
      '.article-navigation a',
      '.related-posts a',
      '.site-footer a',
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
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        };
      })
      .filter(({ width, height }) => width < 44 || height < 44);
  });
}

for (const route of routes) {
  test(`${route.name} reflows without document overflow at ${automatedReflowBoundary.name}`, async ({ page }) => {
    // Break caught: a descendant paints outside the viewport without widening the document or activating an unapproved scroller.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route.path);
    await applyAutomatedReflowBoundary(page);
    const diagnostics = await reflowDiagnostics(page);
    expect(diagnostics.bodyOverflowX, JSON.stringify(diagnostics, null, 2)).not.toBe('hidden');
    expect(diagnostics.scrollWidth, JSON.stringify(diagnostics, null, 2)).toBeLessThanOrEqual(diagnostics.clientWidth);
    expect(diagnostics.internalOverflow, JSON.stringify(diagnostics, null, 2)).toEqual([]);
    expect(diagnostics.boundsOverflow, JSON.stringify(diagnostics, null, 2)).toEqual([]);
  });

  test(`${route.name} visible interactive targets are at least 44px at ${automatedReflowBoundary.name}`, async ({ page }) => {
    // Break caught: a required identity, navigation, search, interactive tag, or like target is missing or too small.
    await page.goto(route.path);
    await applyAutomatedReflowBoundary(page);
    await expect.poll(() => undersizedTargets(page)).toEqual([]);
    await expect(page.locator('.brand')).toBeVisible();
  });
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

test('whole-page fade keeps article content paintable and never intercepts interaction', async ({ page }) => {
  // Break caught: a fade applied to body produces NO_LCP even though the article becomes visually opaque.
  await page.addInitScript(() => {
    window.__lcpEntries = [];
    new PerformanceObserver((list) => {
      window.__lcpEntries.push(...list.getEntries().map((entry) => ({
        size: entry.size,
        tagName: entry.element && entry.element.tagName,
      })));
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await page.goto('/posts/stm32-baremetal-scheduler.html');

  const paintState = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const curtain = getComputedStyle(document.body, '::after');
    return {
      bodyOpacity: body.opacity,
      curtainAnimation: curtain.animationName,
      curtainPointerEvents: curtain.pointerEvents,
    };
  });
  expect(paintState).toEqual({
    bodyOpacity: '1',
    curtainAnimation: 'pageCurtainReveal',
    curtainPointerEvents: 'none',
  });
  await expect.poll(() => page.evaluate(() => window.__lcpEntries)).not.toEqual([]);
});

test('search reserves result geometry and keeps cumulative layout shift within its gate', async ({ page }) => {
  // Break caught: the empty client-rendered result region leaves the footer visible before cards push it away.
  await page.addInitScript(() => {
    window.__layoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__layoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/search.html?q=STM32');
  const results = page.locator('#search-results');
  await expect(results).toHaveAttribute('data-search-active', 'true');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.locator('.post-card').first()).toBeVisible();

  const geometry = await results.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    minBlockSize: getComputedStyle(element).minBlockSize,
    viewportHeight: window.innerHeight,
  }));
  expect(geometry.minBlockSize).toBe(`${geometry.viewportHeight}px`);
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.viewportHeight);
  expect(await page.evaluate(() => window.__layoutShift)).toBeLessThanOrEqual(0.1);
});
