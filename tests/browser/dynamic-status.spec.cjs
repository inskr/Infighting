'use strict';

const { test, expect } = require('@playwright/test');

const sharedStatus = '[data-site-announcement][role="status"][aria-live="polite"][aria-atomic="true"]';

test('search exposes one shared status, aggregate completion, and loading busy state', async ({ page }) => {
  let releaseIndex;
  const indexReleased = new Promise((resolve) => { releaseIndex = resolve; });
  await page.route('**/assets/search-index.json', async (route) => {
    await indexReleased;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/search.html');

  const input = page.getByRole('searchbox', { name: '搜索关键词' });
  const status = page.locator(sharedStatus);
  const results = page.locator('#search-results');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('id', 'search-input');
  await expect(page.locator('label[for="search-input"]')).toBeVisible();
  await expect(status).toHaveCount(1);
  await expect(status).toHaveClass(/visually-hidden/);

  await page.evaluate((selector) => {
    const surface = document.querySelector(selector);
    window.__statusMessages = [];
    new MutationObserver(() => {
      if (surface.textContent) window.__statusMessages.push(surface.textContent);
    }).observe(surface, { childList: true, characterData: true, subtree: true });
  }, sharedStatus);

  await input.fill('radar');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await expect(status).toHaveText('正在搜索“radar”。');

  releaseIndex();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(status).toHaveText('没有找到与“radar”匹配的文章。');
  const messages = await page.evaluate(() => window.__statusMessages);
  expect(messages.filter((message) => message === '没有找到与“radar”匹配的文章。')).toHaveLength(1);
});

test('search failure preserves recovery state and only submitted failure focuses Retry', async ({ page }) => {
  await page.route('**/assets/search-index.json', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{}',
  }));
  await page.goto('/search.html');

  const input = page.getByRole('searchbox', { name: '搜索关键词' });
  const results = page.locator('#search-results');
  await input.fill('submitted');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  const submittedRetry = page.getByRole('button', { name: '重试' });
  await expect(submittedRetry).toBeFocused();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(input).toHaveValue('submitted');
  await expect(page).toHaveURL(/\?q=submitted$/);
  await expect(page.locator(sharedStatus)).toHaveText('搜索暂时不可用，请重试。');

  await page.reload();
  await input.fill('typed');
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('typed');
  await expect(page).toHaveURL(/\?q=typed$/);
});

test('home success and article rollback announce through the single shared status', async ({ page }) => {
  await page.goto('/');
  const homeStatus = page.locator(sharedStatus);
  await expect(homeStatus).toHaveCount(1);
  const homeLike = page.locator('.like-btn').first();
  await homeLike.click();
  await expect(homeStatus).toContainText('点赞成功，当前点赞数');

  await page.route('**/api/content/*/like', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ code: 1, message: 'offline' }),
  }));
  await page.goto('/posts/stm32-baremetal-scheduler.html');
  const articleStatus = page.locator(sharedStatus);
  await expect(articleStatus).toHaveCount(1);
  const articleLike = page.locator('.like-btn');
  await articleLike.click();
  await expect(articleStatus).toContainText('点赞失败，已恢复到');
  await expect(articleLike).toBeEnabled();
  await expect(page.locator('.article-body')).toBeVisible();
});
