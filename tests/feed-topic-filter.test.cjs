'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isTopicRelevant, mergeArchive, selectBoardItems } = require('../scripts/fetch-feeds');

test('admits embedded and edge AI engineering content', () => {
  const accepted = [
    { title: 'Building a low-power STM32 FreeRTOS sensor node' },
    { title: 'Deploying quantized TinyML inference on an MCU' },
    { title: 'New Jetson edge AI developer kit adds an NPU' },
    { title: 'NPU inference quantization for vision camera deployment' },
  ];

  for (const item of accepted) assert.equal(isTopicRelevant(item), true, item.title);
});

test('rejects capital and corporate news even when it mentions edge AI', () => {
  const rejected = [
    { title: 'Microchip acquires edge AI startup Hailo' },
    { title: '芯片公司完成新一轮融资，估值达到百亿元' },
    { title: 'MCU vendor reports quarterly earnings and revenue growth' },
    { title: 'Embedded systems company appoints a new chief executive' },
  ];

  for (const item of rejected) assert.equal(isTopicRelevant(item), false, item.title);
});

test('rejects generic technology news without enough domain relevance', () => {
  assert.equal(
    isTopicRelevant({ title: 'Cloud platform launches a new developer dashboard' }),
    false
  );
});

test('rejects HarmonyOS app and UI content without embedded signals', () => {
  const rejected = [
    { title: '鸿蒙应用开发之路由：Router 页面路由使用教程' },
    { title: '[鸿蒙从零到一] HarmonyOS Web 组件与 JSBridge 通信实战' },
  ];

  for (const item of rejected) assert.equal(isTopicRelevant(item), false, item.title);
});

test('rejects generic enterprise content with related signals only in its summary', () => {
  assert.equal(
    isTopicRelevant({
      title: 'Palantir 带火了本体，APM 排障有了本体就够吗？',
      summary: '传感器 | 推理 | 大模型',
    }),
    false
  );
});

test('admits OpenHarmony embedded work with a real embedded signal', () => {
  assert.equal(
    isTopicRelevant({ title: 'OpenHarmony MCU device driver development tutorial' }),
    true
  );
});

test('sanitizes archived boards while merging today within the seven-day window', () => {
  const validArchived = {
    title: 'STM32 RTOS driver tutorial',
    link: 'https://example.com/stm32',
    source: 'Fixture',
    date: '2026-08-02',
    summary: '',
    lang: 'en',
  };
  const staleFinance = {
    title: 'Hang Seng index rises after trading opens',
    link: 'https://example.com/hsi',
    source: 'Fixture',
    date: '2026-08-02',
    summary: '',
    lang: 'en',
  };
  const archive = {
    days: [
      { date: '2026-08-03', boards: { en: [staleFinance] } },
      { date: '2026-08-02', boards: { en: [validArchived, staleFinance] } },
      { date: '2026-07-28', boards: { en: [validArchived] } },
      { date: '2026-07-27', boards: { en: [validArchived] } },
    ],
  };
  const todayBoards = {
    en: [{
      title: 'Edge AI deployment on an MCU',
      link: 'https://example.com/edge-ai',
      source: 'Fixture',
      date: '2026-08-03',
      summary: '',
      lang: 'en',
    }],
  };

  const merged = mergeArchive(archive, todayBoards, '2026-08-03T12:00:00.000Z');

  assert.deepEqual(merged.days.map((day) => day.date), [
    '2026-08-03',
    '2026-08-02',
    '2026-07-28',
  ]);
  assert.deepEqual(merged.days[0].boards.en.map((item) => item.title), [
    'Edge AI deployment on an MCU',
  ]);
  assert.deepEqual(merged.days[1].boards.en.map((item) => item.title), [
    'STM32 RTOS driver tutorial',
  ]);
});

test('does not pad a board with unrelated items when few technical items qualify', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'Zephyr RTOS adds a new STM32 device driver',
      summary: '',
      link: 'https://example.com/zephyr-driver',
      source: 'Fixture',
      date: '2026-08-03',
      _ts: now,
    },
    {
      title: 'Markets rally after company results',
      summary: 'Stocks rise across major indexes',
      link: 'https://example.com/markets',
      source: 'Fixture',
      date: '2026-08-03',
      _ts: now - 1000,
    },
  ];

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'Zephyr RTOS adds a new STM32 device driver',
  ]);
  assert.equal(selected[0].lang, 'en');
});
