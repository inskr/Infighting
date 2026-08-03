'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isTopicRelevant, selectBoardItems } = require('../scripts/fetch-feeds');

test('admits embedded and edge AI engineering content', () => {
  const accepted = [
    { title: 'Building a low-power STM32 FreeRTOS sensor node' },
    { title: 'Deploying quantized TinyML inference on an MCU' },
    { title: 'New Jetson edge AI developer kit adds an NPU' },
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
