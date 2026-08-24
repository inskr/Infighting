'use strict';

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const blockingImpacts = new Set(['serious', 'critical']);

function findingReport(state, violations) {
  return violations.map((violation) => ({
    state,
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      summary: node.failureSummary || node.any.concat(node.all, node.none)
        .map((check) => check.message)
        .join(' '),
    })),
  }));
}

async function analyzeStableState(page, testInfo, state) {
  const results = await new AxeBuilder({ page }).analyze();
  const report = findingReport(state, results.violations);
  await testInfo.attach('axe-findings', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  });
  const blocking = results.violations.filter((violation) => blockingImpacts.has(violation.impact));
  expect(blocking, JSON.stringify(findingReport(state, blocking), null, 2)).toEqual([]);
}

async function selectThemeBeforeNavigation(page, theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('infighting-theme', selectedTheme);
  }, theme);
}

for (const theme of ['dark', 'light']) {
  test(`home ${theme} theme has no serious or critical axe violations`, async ({ page }, testInfo) => {
    // Break caught: the selected home theme introduces a blocking contrast or semantic regression.
    await selectThemeBeforeNavigation(page, theme);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('.post-card').first()).toBeVisible();
    await analyzeStableState(page, testInfo, `home ${theme} — /`);
  });

  test(`search Hero ${theme} theme preserves its labelled heading and has no blocking axe violations`, async ({ page }, testInfo) => {
    // Break caught: the parser-present Search Hero loses its accessible name or theme contrast.
    await selectThemeBeforeNavigation(page, theme);
    await page.goto('/search.html?q=STM32');
    await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
    const hero = page.locator('.search-hero');
    await expect(hero).toHaveAttribute('aria-labelledby', 'search-hero-title');
    await expect(page.locator('#search-hero-title')).toHaveText('搜索站内内容');
    await analyzeStableState(page, testInfo, `search Hero ${theme} — /search.html?q=STM32`);
  });
}

test('empty search has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: the initialized empty-search form or results relationship is inaccessible.
  await page.goto('/search.html');
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#search-status')).toHaveText('输入关键词开始搜索。');
  await analyzeStableState(page, testInfo, 'search empty — /search.html');
});

test('populated search has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: dynamically rendered result cards introduce blocking semantics or contrast failures.
  await page.goto('/search.html');
  const input = page.getByRole('searchbox', { name: '搜索关键词' });
  await input.fill('STM32');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#search-results .post-card').first()).toBeVisible();
  await expect(page.locator('#search-status')).toContainText('找到 ');
  await analyzeStableState(page, testInfo, 'search populated (STM32) — /search.html?q=STM32');
});

test('populated search preserves h1, h2, h3 outline with zero axe violations at every impact', async ({ page }) => {
  // Break caught: result-card headings bypass their persistent section heading or introduce lesser-impact axe debt.
  await page.goto('/search.html?q=STM32');
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#search-results .post-card').first()).toBeVisible();

  const outline = await page.locator('main h1, main h2, main h3')
    .evaluateAll((headings) => headings.map((heading) => ({
      id: heading.id,
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent.trim(),
    })));
  expect(outline[0].level).toBe(1);
  expect(outline[0]).toEqual({ id: 'search-hero-title', level: 1, text: '搜索站内内容' });
  expect(outline.find(({ id }) => id === 'search-results-title')?.level).toBe(2);
  expect(outline.filter(({ level }) => level === 3).length).toBeGreaterThan(0);
  expect(outline.every(({ level }, index) => index === 0 || level <= outline[index - 1].level + 1)).toBe(true);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations, JSON.stringify(findingReport('search outline', axe.violations), null, 2)).toEqual([]);
});

test('no-result search has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: the completed empty-result state loses its accessible status or valid structure.
  await page.goto('/search.html');
  const input = page.getByRole('searchbox', { name: '搜索关键词' });
  await input.fill('zz-no-accessibility-match');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('#search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#search-results .post-card')).toHaveCount(0);
  await expect(page.locator('#search-status')).toContainText('没有找到');
  await analyzeStableState(page, testInfo, 'search no-result — /search.html?q=zz-no-accessibility-match');
});

test('tags page has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: generated tag controls or the settled tag page structure is inaccessible.
  await page.goto('/tags.html');
  await expect(page.locator('#tag-cloud a').first()).toBeVisible();
  await expect(page.locator('#tag-result-title')).not.toBeEmpty();
  await analyzeStableState(page, testInfo, 'tags — /tags.html');
});

test('archive page has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: generated archive days introduce blocking heading or list semantics.
  await page.goto('/archive.html');
  await expect(page.locator('#archive-days .archive-day').first()).toBeVisible();
  await analyzeStableState(page, testInfo, 'archive — /archive.html');
});

test('archive generated headings preserve the page, day, and board hierarchy', async ({ page }) => {
  // Break caught: real archive DOM skips directly from its page h1 to generated h3/h4 headings.
  await page.goto('/archive.html');
  await expect(page.locator('#archive-days .archive-day').first()).toBeVisible();
  const levels = await page.locator('main h1, main h2, main h3, main h4, main h5, main h6')
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));

  expect(levels[0]).toBe(1);
  expect(levels.slice(1)).toContain(2);
  expect(levels.slice(1)).toContain(3);
  expect(levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1)).toBe(true);
});

test('legacy invalid-id error has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: the client-rendered legacy recovery state is missing valid, usable semantics.
  await page.goto('/post.html?id=does-not-exist');
  await expect(page.locator('#legacy-post-status h1')).toHaveText('文章不存在');
  await expect(page.getByRole('link', { name: '返回文章列表' })).toBeVisible();
  await analyzeStableState(page, testInfo, 'legacy invalid-id error — /post.html?id=does-not-exist');
});

test('static article has no serious or critical axe violations', async ({ page }, testInfo) => {
  // Break caught: the complete article body, table of contents, code, or like control regresses.
  await page.goto('/posts/stm32-baremetal-scheduler.html');
  await expect(page.locator('.article-body')).toBeVisible();
  await expect(page.locator('.like-btn')).not.toHaveAttribute('aria-busy', 'true');
  await analyzeStableState(page, testInfo, 'static article — /posts/stm32-baremetal-scheduler.html');
});
