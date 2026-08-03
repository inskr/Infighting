'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isTopicRelevant } = require('../scripts/fetch-feeds');

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
