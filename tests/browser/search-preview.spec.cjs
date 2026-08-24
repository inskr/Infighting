'use strict';

const { test, expect } = require('@playwright/test');

test('initial valid q paints the generated preview during parsing before deferred Search dependencies execute', async ({ page }) => {
  // Break caught: a generated file exists but still waits for posts-index, SearchCore, ContentCards, or SearchPage.
  let releaseIndex;
  const indexReleased = new Promise((resolve) => { releaseIndex = resolve; });
  let fullIndexRequests = 0;
  await page.route('**/assets/search-index.json', async (route) => {
    fullIndexRequests += 1;
    await indexReleased;
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__parserPreview = null;
    new MutationObserver(() => {
      const heading = document.querySelector('#search-results .post-card h3');
      if (!heading || window.__parserPreview) return;
      window.__parserPreview = {
        readyState: document.readyState,
        postsLoaded: Array.isArray(window.POSTS),
        cardsLoaded: !!window.ContentCards,
        searchCoreLoaded: !!window.SearchCore,
        searchPageLoaded: !!window.SearchPage,
        busy: document.querySelector('#search-results').getAttribute('aria-busy'),
        text: heading.textContent,
      };
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto('/search.html?q=STM32');
  const results = page.locator('#search-results');
  await expect(results.locator('.post-card').first()).toBeVisible();
  await expect(results.locator('.post-card')).toHaveCount(5);
  await expect(results).toHaveAttribute('data-search-preview', 'true');
  await expect(results).toHaveAttribute('aria-busy', 'true');
  expect(await page.evaluate(() => window.__parserPreview)).toEqual({
    readyState: 'loading',
    postsLoaded: false,
    cardsLoaded: false,
    searchCoreLoaded: false,
    searchPageLoaded: false,
    busy: 'true',
    text: '边缘端神经网络部署：从模型压缩到 STM32H7 推理优化',
  });
  expect(fullIndexRequests).toBe(1);
  await results.evaluate((container) => {
    window.__searchCompletionMutations = 0;
    window.__searchCompletionCardBuilds = 0;
    const originalPostCard = window.ContentCards.postCard;
    window.ContentCards.postCard = function (...args) {
      window.__searchCompletionCardBuilds += 1;
      return originalPostCard.apply(this, args);
    };
    Array.from(container.querySelectorAll('.post-card')).forEach((card, index) => {
      card.setAttribute('data-parser-preview-card', String(index));
      Array.from(card.children).forEach((child, childIndex) => {
        child.setAttribute('data-parser-preview-child', `${index}-${childIndex}`);
      });
    });
    new MutationObserver((records) => {
      window.__searchCompletionMutations += records.filter((record) => record.type === 'childList').length;
    }).observe(container, { childList: true, subtree: true });
  });

  releaseIndex();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results).not.toHaveAttribute('data-search-preview');
  await expect(results.locator('.post-card')).toHaveCount(5);
  expect(await results.evaluate((container) => ({
    cardBuilds: window.__searchCompletionCardBuilds,
    childListMutations: window.__searchCompletionMutations,
    preservedCards: container.querySelectorAll('[data-parser-preview-card]').length,
    preservedChildren: container.querySelectorAll('[data-parser-preview-child]').length,
  }))).toEqual({
    cardBuilds: 0,
    childListMutations: 0,
    preservedCards: 5,
    preservedChildren: 15,
  });
  expect(fullIndexRequests).toBe(1);
});

test('empty q executes the inline preview but requests neither an external preview nor the 242KB full index', async ({ page }) => {
  // Break caught: empty Search regresses from valid-query-only full-index loading.
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));

  await page.goto('/search.html');

  await expect(page.locator('#search-results .post-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.SearchPreviewState)).toMatchObject({
    preview: false,
    reason: 'empty-query',
  });
  expect(requests.filter((pathname) => pathname.endsWith('/assets/search-index.json'))).toEqual([]);
  expect(requests.filter((pathname) => pathname.endsWith('/assets/js/search-preview.js'))).toEqual([]);
});
