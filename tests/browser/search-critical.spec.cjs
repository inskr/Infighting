'use strict';

const { test, expect } = require('@playwright/test');

async function pauseEnhancementStylesheet(page) {
  let releaseRequest;
  let markRequested;
  const requested = new Promise((resolve) => { markRequested = resolve; });
  const released = new Promise((resolve) => { releaseRequest = resolve; });
  await page.route('**/assets/css/style.css', async (route) => {
    markRequested();
    await released;
    await route.continue();
  });
  return { requested, release: releaseRequest };
}

async function installEarlyThemeProbe(page, theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('infighting-theme', selectedTheme);
    window.__themeWhenBodyAppeared = null;
    const observer = new MutationObserver(() => {
      if (!document.body || window.__themeWhenBodyAppeared !== null) return;
      window.__themeWhenBodyAppeared = document.documentElement.getAttribute('data-theme');
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  }, theme);
}

async function installLayoutShiftProbe(page) {
  await page.addInitScript(() => {
    window.__criticalLayoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__criticalLayoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function criticalSnapshot(page) {
  return page.evaluate(() => {
    const selectors = [
      '.site-header',
      '.nav-shell',
      '#main-content',
      '.search-hero',
      '#search-hero-title',
      '.search-panel',
      '#search-results-title',
      '#search-results',
      '#search-results .post-card:first-child',
      '.site-footer',
    ];
    const rects = Object.fromEntries(selectors.map((selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [selector, {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      }];
    }));
    const body = getComputedStyle(document.body);
    const card = getComputedStyle(document.querySelector('#search-results .post-card'));
    const results = getComputedStyle(document.querySelector('#search-results'));
    const hero = getComputedStyle(document.querySelector('.search-hero'));
    const heroTitle = getComputedStyle(document.querySelector('#search-hero-title'));
    const resultsTitle = getComputedStyle(document.querySelector('#search-results-title'));
    const curtain = getComputedStyle(document.body, '::after');
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      body: { backgroundColor: body.backgroundColor, color: body.color, display: body.display },
      card: {
        display: card.display,
        minHeight: card.minHeight,
        padding: card.padding,
        borderRadius: card.borderRadius,
      },
      results: {
        display: results.display,
        gridTemplateColumns: results.gridTemplateColumns,
        minBlockSize: results.minBlockSize,
      },
      hero: {
        opacity: hero.opacity,
        visibility: hero.visibility,
        titleColor: heroTitle.color,
        titleFontSize: heroTitle.fontSize,
        titleLineHeight: heroTitle.lineHeight,
        resultsTitleFontSize: resultsTitle.fontSize,
      },
      curtain: {
        animationName: curtain.animationName,
        animationDuration: curtain.animationDuration,
        pointerEvents: curtain.pointerEvents,
      },
      rects,
    };
  });
}

test('JavaScript-disabled Search uses the noscript stylesheet and remains usable at mobile width', async ({ browser }) => {
  // Break caught: non-blocking CSS makes Search unstyled when scripting is unavailable or blocked.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.goto('/search.html?q=STM32');
    await expect(page.getByRole('heading', { name: '搜索站内内容' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: '搜索关键词' })).toBeVisible();
    await expect(page.locator('.search-noscript')).toBeVisible();
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelPadding: getComputedStyle(document.querySelector('.search-panel')).padding,
      resultsDisplay: getComputedStyle(document.querySelector('#search-results')).display,
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => ({
        href: link.getAttribute('href'),
        media: link.media,
      })),
    }));
    expect(state.overflow).toBeLessThanOrEqual(0);
    expect(state.panelPadding).toBe('20px');
    expect(state.resultsDisplay).toBe('grid');
    expect(state.stylesheets).toEqual([
      { href: 'assets/css/style.css', media: 'print' },
      { href: 'assets/css/style.css', media: '' },
    ]);
  } finally {
    await context.close();
  }
});

for (const [theme, expectedBackground] of [
  ['dark', 'rgb(6, 0, 16)'],
  ['light', 'rgb(238, 243, 251)'],
]) {
  test(`stored ${theme} theme is applied before body parsing while enhancement CSS is delayed`, async ({ page }) => {
    // Break caught: the Search-only inline bootstrap paints the fallback theme before applying the stored theme.
    await installEarlyThemeProbe(page, theme);
    const control = await pauseEnhancementStylesheet(page);
    const navigation = page.goto('/search.html?q=STM32');
    await control.requested;
    await expect(page.locator('#search-results .post-card').first()).toBeVisible();

    expect(await page.evaluate(() => window.__themeWhenBodyAppeared)).toBe(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('link[data-enhancement-stylesheet]')).toHaveAttribute('media', 'print');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe(expectedBackground);

    control.release();
    await navigation;
    await expect(page.locator('link[data-enhancement-stylesheet]')).toHaveAttribute('media', 'all');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe(expectedBackground);
  });
}

test('loading the delayed full stylesheet changes neither Search geometry nor its critical visual state', async ({ page }) => {
  // Break caught: marker coverage omits a Search rule and the enhancement request causes FOUC, CLS, or a theme jump.
  await page.setViewportSize({ width: 390, height: 844 });
  await installEarlyThemeProbe(page, 'light');
  await installLayoutShiftProbe(page);
  const control = await pauseEnhancementStylesheet(page);
  const navigation = page.goto('/search.html?q=STM32');
  await control.requested;
  await expect(page.locator('#search-results .post-card')).toHaveCount(5);
  // Compare stylesheet states only after the required authoritative handoff has replaced preview summaries.
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  const criticalOnly = await criticalSnapshot(page);

  expect(criticalOnly.theme).toBe('light');
  expect(criticalOnly.body.backgroundColor).toBe('rgb(238, 243, 251)');
  expect(criticalOnly.body.display).toBe('flex');
  expect(criticalOnly.card.display).toBe('flex');
  expect(criticalOnly.results.display).toBe('grid');
  expect(criticalOnly.hero.opacity).toBe('1');
  expect(criticalOnly.hero.visibility).toBe('visible');
  expect(parseFloat(criticalOnly.hero.titleFontSize))
    .toBeGreaterThan(parseFloat(criticalOnly.hero.resultsTitleFontSize) * 1.35);
  expect(parseFloat(criticalOnly.hero.titleLineHeight))
    .toBeGreaterThan(parseFloat(criticalOnly.hero.titleFontSize));
  expect(criticalOnly.curtain).toEqual({
    animationName: 'pageCurtainReveal',
    animationDuration: '0.36s',
    pointerEvents: 'none',
  });

  control.release();
  await navigation;
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('link[data-enhancement-stylesheet]')).toHaveAttribute('media', 'all');
  const enhanced = await criticalSnapshot(page);
  expect(enhanced).toEqual(criticalOnly);
  expect(await page.evaluate(() => window.__criticalLayoutShift)).toBeLessThanOrEqual(0.1);
});

test('critical-only Search honors reduced motion before the enhancement stylesheet arrives', async ({ page }) => {
  // Break caught: extracting the curtain without its reduced-motion override reintroduces startup motion.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const control = await pauseEnhancementStylesheet(page);
  const navigation = page.goto('/search.html?q=STM32');
  await control.requested;
  await expect(page.locator('#search-results .post-card').first()).toBeVisible();
  const criticalOnly = await page.evaluate(() => {
    const curtain = getComputedStyle(document.body, '::after');
    return {
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animationName: curtain.animationName,
      opacity: curtain.opacity,
    };
  });
  expect(criticalOnly).toEqual({ scrollBehavior: 'auto', animationName: 'none', opacity: '0' });

  control.release();
  await navigation;
  expect(await page.evaluate(() => {
    const curtain = getComputedStyle(document.body, '::after');
    return {
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animationName: curtain.animationName,
      opacity: curtain.opacity,
    };
  })).toEqual(criticalOnly);
});
