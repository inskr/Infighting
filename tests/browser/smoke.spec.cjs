'use strict';

const { test, expect } = require('@playwright/test');

test('published routes load without page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error));

  for (const route of [
    '/',
    '/search.html',
    '/tags.html',
    '/archive.html',
    '/posts/stm32-baremetal-scheduler.html'
  ]) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test('Search remains readable and navigable when JavaScript is disabled', async ({ browser }) => {
  // Break caught: parser bootstrap makes the route blank, trapped, or dependent on script execution for basic navigation.
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('/search.html?q=STM32');
    await expect(page.getByRole('heading', { level: 1, name: '搜索站内内容' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '搜索结果' })).toBeVisible();
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.getByText(/JavaScript/)).toBeVisible();
    await expect(page.locator('#main-content').getByRole('link', { name: '标签' }))
      .toHaveAttribute('href', 'tags.html');
    await expect(page.locator('#search-results .post-card')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
