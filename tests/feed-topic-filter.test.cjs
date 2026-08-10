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

test('requires engineering context for broad technology topics', () => {
  assert.equal(classifyTopic(item('STM32 FreeRTOS 固件开发教程', 0, 'strict')), 'strict');
  assert.equal(classifyTopic(item('鸿蒙 ArkUI 组件性能优化与开发实践', 0, 'engineering')), 'strict');
  assert.equal(classifyTopic(item('新型传感器发布', 0, 'generic')), 'relaxed');
  assert.equal(classifyTopic(item('AI 芯片公司完成 20 亿元融资', 0, 'finance')), 'blocked');
  assert.equal(classifyTopic(item('城市周末活动指南', 0, 'irrelevant')), 'irrelevant');
});

test('finance and corporate news stays blocked even when it mentions AI or chips', () => {
  const blockedTitles = [
    'AI 芯片公司发布季度财报',
    '半导体企业营收同比增长 30%',
    '机器人公司获战略投资',
    '芯片独角兽启动 IPO',
    '大模型企业估值突破百亿',
    'GPU 厂商季度业绩与净利润公布',
  ];
  blockedTitles.forEach((title, index) => {
    assert.equal(classifyTopic(item(title, 0, `blocked-${index}`)), 'blocked', title);
  });
});

test('domestic selection never fills its minimum with generic technology releases', () => {
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
