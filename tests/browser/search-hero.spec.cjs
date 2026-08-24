'use strict';

const { test, expect } = require('@playwright/test');

const minimumCandidateAreaRatio = 1.1;

async function installLcpProbe(page) {
  await page.addInitScript(() => {
    window.__searchLcpEntries = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = entry.element;
        window.__searchLcpEntries.push({
          id: element?.id || '',
          size: entry.size,
          tagName: element?.tagName || '',
          text: element?.textContent?.trim() || '',
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
}

async function settleSearch(page, path, expectsResults) {
  await page.goto(path);
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  if (expectsResults) await expect(page.locator('#search-results .post-card').first()).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function candidateState(page) {
  return page.evaluate(() => {
    const title = document.querySelector('#search-hero-title');
    const hero = document.querySelector('.search-hero');
    const titleRect = title.getBoundingClientRect();
    const style = getComputedStyle(title);
    const resultCandidates = [...document.querySelectorAll(
      '#search-results-title, #search-results h3, #search-results .post-summary'
    )].map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width * rect.height;
    });
    const heroRect = hero.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heroArea: titleRect.width * titleRect.height,
      heroOpacity: style.opacity,
      heroVisibility: style.visibility,
      heroWithinViewport: heroRect.left >= -1 && heroRect.right <= document.documentElement.clientWidth + 1,
      lineHeightRatio: parseFloat(style.lineHeight) / parseFloat(style.fontSize),
      maxResultArea: Math.max(1, ...resultCandidates),
      text: title.textContent.trim(),
    };
  });
}

for (const state of [
  { name: 'initial', path: '/search.html', expectsResults: false },
  { name: 'results', path: '/search.html?q=STM32', expectsResults: true },
]) {
  test(`Search Hero is the natural largest paint candidate in the ${state.name} state`, async ({ page }) => {
    // Break caught: late Search content supersedes the meaningful parser-present Hero as LCP.
    await page.setViewportSize({ width: 390, height: 844 });
    await installLcpProbe(page);
    await settleSearch(page, state.path, state.expectsResults);

    await expect.poll(() => page.evaluate(() => window.__searchLcpEntries.at(-1)?.id || ''))
      .toBe('search-hero-title');
    const candidate = await candidateState(page);
    expect(candidate.text).toBe('搜索站内内容');
    expect(candidate.heroOpacity).toBe('1');
    expect(candidate.heroVisibility).toBe('visible');
    expect(candidate.heroWithinViewport).toBe(true);
    expect(candidate.heroArea).toBeGreaterThan(candidate.maxResultArea * minimumCandidateAreaRatio);
    expect(candidate.lineHeightRatio).toBeGreaterThan(1);
    expect(candidate.lineHeightRatio).toBeLessThan(1.3);
  });
}

test('Search Hero keeps its visual hierarchy without overflow at 320 CSS px', async ({ page }) => {
  // Break caught: the larger meaningful title becomes clipped or loses its hierarchy on narrow screens.
  await page.setViewportSize({ width: 320, height: 800 });
  await settleSearch(page, '/search.html?q=STM32', true);
  const candidate = await candidateState(page);
  expect(candidate.documentOverflow).toBeLessThanOrEqual(0);
  expect(candidate.heroWithinViewport).toBe(true);
  expect(candidate.heroArea).toBeGreaterThan(candidate.maxResultArea * minimumCandidateAreaRatio);
});

test('valid initial query waits for the observed Hero LCP before fetching the full index', async ({ page }) => {
  // Break caught: frame callbacks run without a real paint and let the authoritative index enter the Hero LCP chain.
  let releaseIndex;
  let fullIndexFetches = 0;
  const indexReleased = new Promise((resolve) => { releaseIndex = resolve; });
  await page.addInitScript(() => {
    const NativePerformanceObserver = window.PerformanceObserver;
    const control = {
      disconnects: 0,
      observer: null,
      emit(elementId) {
        if (!this.observer) throw new Error('Hero paint observer is not registered');
        const element = document.getElementById(elementId);
        this.observer.callback({
          getEntries() {
            return [{ element, entryType: 'largest-contentful-paint' }];
          },
        });
      },
    };

    class ControlledPerformanceObserver {
      constructor(callback) {
        this.callback = callback;
        this.delegate = null;
      }

      observe(options) {
        if (options && options.type === 'largest-contentful-paint') {
          control.observer = this;
          return;
        }
        this.delegate = new NativePerformanceObserver(this.callback);
        this.delegate.observe(options);
      }

      disconnect() {
        control.disconnects += 1;
        if (this.delegate) this.delegate.disconnect();
      }

      takeRecords() {
        return this.delegate ? this.delegate.takeRecords() : [];
      }
    }

    Object.defineProperty(ControlledPerformanceObserver, 'supportedEntryTypes', {
      get() {
        return [...new Set([
          ...(NativePerformanceObserver.supportedEntryTypes || []),
          'largest-contentful-paint',
        ])];
      },
    });
    window.PerformanceObserver = ControlledPerformanceObserver;
    window.__heroPaintControl = control;
  });
  await page.route('**/assets/search-index.json', async (route) => {
    fullIndexFetches += 1;
    await indexReleased;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'paint-result',
        title: 'STM32 paint result',
        summary: 'Authoritative result',
        body: 'STM32 full-text body',
        tags: ['STM32'],
        date: '2026-08-24',
      }]),
    });
  });

  await page.goto('/search.html?q=STM32');
  const results = page.locator('#search-results');
  const status = page.locator('#search-status');
  await expect(results.locator('.post-card')).toHaveCount(5);
  await expect(results).toHaveAttribute('data-search-preview', 'true');
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await page.waitForTimeout(100);
  expect(fullIndexFetches).toBe(0);

  await page.evaluate(() => window.__heroPaintControl.emit('search-results-title'));
  await page.waitForTimeout(50);
  expect(fullIndexFetches).toBe(0);

  await page.evaluate(() => {
    window.__paintStatusMessages = [];
    new MutationObserver(() => {
      window.__paintStatusMessages.push(document.getElementById('search-status').textContent);
    }).observe(document.getElementById('search-status'), {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.__heroPaintControl.emit('search-hero-title');
  });
  await expect.poll(() => fullIndexFetches).toBe(1);
  await expect(results).toHaveAttribute('data-search-preview', 'true');
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.evaluate(() => window.__heroPaintControl.disconnects)).toBe(1);
  await page.waitForTimeout(50);
  expect(fullIndexFetches).toBe(1);

  releaseIndex();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.locator('.post-card')).toHaveCount(1);
  await expect(status).toHaveText('找到 1 篇与“STM32”匹配的文章。');
  expect(await page.evaluate(() => window.__paintStatusMessages.filter(
    (message) => message === '找到 1 篇与“STM32”匹配的文章。'
  ))).toHaveLength(1);
  expect(fullIndexFetches).toBe(1);
});
