'use strict';

const { test, expect } = require('@playwright/test');

const sharedStatus = '[data-site-announcement][role="status"][aria-live="polite"][aria-atomic="true"]';

async function observeAnnouncements(page) {
  await page.evaluate((selector) => {
    const surface = document.querySelector(selector);
    window.__statusMessages = [];
    new MutationObserver(() => {
      if (surface.textContent) window.__statusMessages.push(surface.textContent);
    }).observe(surface, { childList: true, characterData: true, subtree: true });
  }, sharedStatus);
}

async function announcementLog(page) {
  return page.evaluate(() => window.__statusMessages);
}

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

  await observeAnnouncements(page);

  await input.fill('radar');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await expect(status).toHaveText('已显示快速预览，正在搜索“radar”的全文内容。');

  releaseIndex();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(status).toHaveText('没有找到与“radar”匹配的文章。');
  const messages = await announcementLog(page);
  expect(messages.filter((message) => message === '没有找到与“radar”匹配的文章。')).toHaveLength(1);
});

test('newer non-empty search exclusively owns busy completion and announcement', async ({ page }) => {
  let releaseIndex;
  const indexReleased = new Promise((resolve) => { releaseIndex = resolve; });
  await page.route('**/assets/search-index.json', async (route) => {
    await indexReleased;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/search.html');
  await observeAnnouncements(page);
  await page.evaluate((selector) => {
    const search = window.SearchCore.search;
    window.__beforeCurrentCompletion = [];
    window.SearchCore.search = function observedSearch(index, query) {
      window.__beforeCurrentCompletion.push({
        busy: document.querySelector('#search-results').getAttribute('aria-busy'),
        query,
        status: document.querySelector(selector).textContent,
      });
      return search.call(this, index, query);
    };
  }, sharedStatus);

  const input = page.getByRole('searchbox', { name: '搜索关键词' });
  const results = page.locator('#search-results');
  const status = page.locator(sharedStatus);
  await input.fill('alpha');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(status).toHaveText('已显示快速预览，正在搜索“alpha”的全文内容。');
  await input.fill('beta');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(results).toHaveAttribute('aria-busy', 'true');
  await expect(status).toHaveText('已显示快速预览，正在搜索“beta”的全文内容。');

  releaseIndex();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(status).toHaveText('没有找到与“beta”匹配的文章。');
  expect(await page.evaluate(() => window.__beforeCurrentCompletion)).toEqual([
    {
      busy: 'true',
      query: 'alpha',
      status: '正在搜索“alpha”。',
    },
    {
      busy: 'true',
      query: 'beta',
      status: '正在搜索“beta”。',
    },
    {
      busy: 'true',
      query: 'beta',
      status: '已显示快速预览，正在搜索“beta”的全文内容。',
    },
  ]);
  expect(await announcementLog(page)).toEqual([
    '已显示快速预览，正在搜索“alpha”的全文内容。',
    '已显示快速预览，正在搜索“beta”的全文内容。',
    '没有找到与“beta”匹配的文章。',
  ]);
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
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const homeStatus = page.locator(sharedStatus);
  await expect(homeStatus).toHaveCount(1);
  await observeAnnouncements(page);
  const homeLike = page.locator('.like-btn').first();
  await homeLike.click();
  await expect(homeLike).toHaveAttribute('aria-label', '已点赞');
  await expect(homeLike).toBeDisabled();
  await expect(homeLike).not.toHaveAttribute('aria-busy', 'true');
  const confirmedCount = await homeLike.locator('.like-count').textContent();
  const successMessage = '点赞成功，当前点赞数 ' + confirmedCount + '。';
  await expect(homeStatus).toHaveText(successMessage);
  expect(await announcementLog(page)).toEqual([successMessage]);

  const isolatedLike = page.locator('.like-btn').nth(1);
  await page.evaluate(() => {
    window.LikesStorage.hasLiked = () => { throw new Error('storage read unavailable'); };
    window.LikesStorage.markLiked = () => { throw new Error('storage write unavailable'); };
    window.SiteShell.announce = () => { throw new Error('announcement unavailable'); };
  });
  await isolatedLike.click();
  await expect(isolatedLike).toHaveAttribute('aria-label', '已点赞');
  await expect(isolatedLike).toBeDisabled();
  await expect(isolatedLike).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('main')).toBeVisible();
  expect(pageErrors).toEqual([]);

  await page.route('**/api/content/*/like', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ code: 1, message: 'offline' }),
  }));
  await page.goto('/posts/stm32-baremetal-scheduler.html');
  const articleStatus = page.locator(sharedStatus);
  await expect(articleStatus).toHaveCount(1);
  await observeAnnouncements(page);
  const articleLike = page.locator('.like-btn');
  const restoredCount = await articleLike.locator('.like-count').textContent();
  await articleLike.click();
  const rollbackMessage = '点赞失败，已恢复到 ' + restoredCount + '，请重试。';
  await expect(articleStatus).toHaveText(rollbackMessage);
  expect(await announcementLog(page)).toEqual([rollbackMessage]);
  await expect(articleLike.locator('.like-count')).toHaveText(restoredCount);
  await expect(articleLike).toBeEnabled();
  await expect(articleLike).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.article-body')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
