'use strict';

const { test, expect } = require('@playwright/test');

const routes = [
  { path: '/', current: 'home' },
  { path: '/search.html', current: 'search' },
  { path: '/tags.html', current: 'tags' },
  { path: '/archive.html', current: 'archive' },
  { path: '/post.html?id=does-not-exist', current: null },
  { path: '/posts/stm32-baremetal-scheduler.html', current: null },
];

test('published pages send the first keyboard focus directly to their main content', async ({ page }) => {
  // Break caught: the skip control is absent, unreachable first, or cannot move a keyboard user past sticky navigation.
  for (const { path } of routes) {
    await page.goto(path);
    await expect(page.locator('main#main-content')).toHaveAttribute('tabindex', '-1');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => page.evaluate(() => (
      document.activeElement === document.getElementById('main-content') ||
      window.location.hash === '#main-content'
    ))).toBe(true);
  }
});

test('current navigation is precise for top-level destinations and absent for article contexts', async ({ page }) => {
  // Break caught: an article or compatibility URL is inaccurately represented as Home in primary navigation.
  for (const { path, current } of routes) {
    await page.goto(path);
    const currentLinks = page.locator('.site-nav a[aria-current="page"]');
    await expect(currentLinks).toHaveCount(current ? 1 : 0);
    if (current) await expect(currentLinks).toHaveAttribute('data-nav', current);
  }
});

test('main targets and generated article headings reserve space below the sticky navigation', async ({ page }) => {
  // Break caught: fragment targets land underneath the sticky site navigation.
  await page.goto('/posts/stm32-baremetal-scheduler.html');
  const offsets = await page.evaluate(() => {
    const main = document.getElementById('main-content');
    const heading = document.querySelector('.article-body h2[id], .article-body h3[id]');
    return {
      main: Number.parseFloat(getComputedStyle(main).scrollMarginTop),
      heading: Number.parseFloat(getComputedStyle(heading).scrollMarginTop),
      header: document.querySelector('.site-header').getBoundingClientRect().height,
    };
  });

  expect(offsets.main).toBeGreaterThan(offsets.header);
  expect(offsets.heading).toBeGreaterThan(offsets.header);
});

for (const theme of ['dark', 'light']) {
  test(`${theme} theme keeps the focused skip control visibly outlined`, async ({ page }) => {
    // Break caught: a theme's focus treatment becomes invisible against its page surface.
    await page.goto('/');
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme;
    }, theme);
    await page.keyboard.press('Tab');
    const focusStyle = await page.locator('.skip-link').evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        outlineColor: style.outlineColor,
      };
    });

    expect(focusStyle.outlineStyle).toBe('solid');
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);
    expect(Number.parseFloat(focusStyle.outlineOffset)).toBeGreaterThanOrEqual(2);
    expect(focusStyle.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
  });
}

for (const theme of ['dark', 'light']) {
  test(`${theme} theme gives Tab-reachable overflowing article scrollers a high-contrast focus ring`, async ({ page }) => {
    // Break caught: Chromium tabs to overflowing code/table scrollers whose browser-default ring disappears on dark surfaces.
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/posts/stm32-baremetal-scheduler.html');
    await page.evaluate((selectedTheme) => {
      document.documentElement.dataset.theme = selectedTheme;
    }, theme);

    const expected = await page.locator('.article-body pre, .article-body .table-wrapper').evaluateAll((elements) => (
      elements.filter((element) => element.scrollWidth > element.clientWidth + 1).length
    ));
    expect(expected).toBeGreaterThan(0);

    const focused = [];
    for (let step = 0; step < 80 && focused.length < expected; step += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || !active.matches('.article-body pre, .article-body .table-wrapper')) return null;
        const style = getComputedStyle(active);
        return {
          tagName: active.tagName,
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineOffset: Number.parseFloat(style.outlineOffset),
          outlineColor: style.outlineColor,
        };
      });
      if (state) focused.push(state);
    }

    expect(focused).toHaveLength(expected);
    for (const state of focused) {
      expect(state.outlineStyle).toBe('solid');
      expect(state.outlineWidth).toBeGreaterThanOrEqual(2);
      expect(state.outlineOffset).toBeGreaterThanOrEqual(2);
      expect(state.outlineColor).not.toBe('rgba(0, 0, 0, 0)');
    }
  });
}
