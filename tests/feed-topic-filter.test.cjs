'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertPublishableBoards,
  classifyTopic,
  collectBoard,
  selectBoardItems,
} = require('../scripts/fetch-feeds');

const NOW = Date.parse('2026-08-03T00:00:00Z');

function item(title, offset, slug, summary = '') {
  return {
    title,
    summary,
    link: `https://example.com/${slug}`,
    source: 'Fixture',
    date: '2026-08-03',
    _ts: NOW - offset,
  };
}

test('classifies strict, relaxed, blocked, and irrelevant feed items', () => {
  assert.equal(classifyTopic(item('STM32 FreeRTOS 固件开发教程', 0, 'strict')), 'strict');
  assert.equal(classifyTopic(item('新型传感器发布', 0, 'relaxed')), 'relaxed');
  assert.equal(classifyTopic(item('芯片公司完成新一轮融资', 0, 'blocked')), 'blocked');
  assert.equal(classifyTopic(item('城市周末活动指南', 0, 'irrelevant')), 'irrelevant');
});

test('domestic selection uses relaxed technical items only to reach four', () => {
  const selected = selectBoardItems([
    item('STM32 FreeRTOS 固件开发教程', 5000, 'strict-1'),
    item('边缘 AI 模型部署到 MCU', 6000, 'strict-2'),
    item('新型传感器产品应用技术方案正式发布', 1000, 'relaxed-1'),
    item('新型传感器产品应用技术方案详细介绍', 1500, 'relaxed-duplicate'),
    item('蓝牙新品发布', 2000, 'relaxed-2'),
    item('摄像头新品发布', 3000, 'relaxed-3'),
    item('芯片公司完成新一轮融资', 0, 'blocked'),
    item('城市周末活动指南', 500, 'irrelevant'),
  ], 'zh', NOW);

  assert.deepEqual(selected.map((entry) => entry.title), [
    'STM32 FreeRTOS 固件开发教程',
    '边缘 AI 模型部署到 MCU',
    '新型传感器产品应用技术方案正式发布',
    '蓝牙新品发布',
  ]);
  assert.ok(selected.every((entry) => entry.lang === 'zh'));
});

test('domestic selection does not add relaxed items when four strict items exist', () => {
  const selected = selectBoardItems([
    item('STM32 FreeRTOS 固件开发教程', 4000, 'strict-1'),
    item('TinyML 端侧推理优化', 5000, 'strict-2'),
    item('Zephyr 设备驱动实践', 6000, 'strict-3'),
    item('ESP32 物联网固件升级', 7000, 'strict-4'),
    item('新型传感器发布', 0, 'relaxed'),
  ], 'zh', NOW);

  assert.equal(selected.length, 4);
  assert.equal(selected.some((entry) => entry.title === '新型传感器发布'), false);
});

test('international selection never uses relaxed fallback', () => {
  const selected = selectBoardItems([
    item('Zephyr RTOS device driver tutorial', 1000, 'strict'),
    item('New industrial sensor announced', 0, 'relaxed'),
  ], 'en', NOW);

  assert.deepEqual(selected.map((entry) => entry.title), [
    'Zephyr RTOS device driver tutorial',
  ]);
});

test('publication gate rejects fewer than four final domestic items', () => {
  assert.throws(
    () => assertPublishableBoards({ en: [], zh: [{}, {}, {}] }),
    /Domestic daily picks require at least 4 items; got 3/
  );
  assert.doesNotThrow(() =>
    assertPublishableBoards({ en: [], zh: [{}, {}, {}, {}] })
  );
});

test('one failed domestic source does not discard successful sources', async () => {
  const xml = `
    <rss><channel><item>
      <title>STM32 FreeRTOS 固件开发教程</title>
      <link>https://example.com/story</link>
      <pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate>
    </item></channel></rss>`;
  const fetcher = async (url) => {
    if (url.endsWith('/failed')) throw new Error('fixture failure');
    return xml;
  };

  const selected = await collectBoard([
    { name: 'Failed', url: 'https://example.com/failed' },
    { name: 'Working', url: 'https://example.com/working' },
  ], 'zh', fetcher, NOW);

  assert.deepEqual(selected.map((entry) => entry.title), [
    'STM32 FreeRTOS 固件开发教程',
  ]);
});
