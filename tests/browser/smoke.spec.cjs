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
