'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertPublishableBoards,
  classifyTopic,
  collectBoard,
  mergeDomesticWithPrevious,
  parseGeneratedFeeds,
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

test('parses only the generated window.FEEDS assignment shape', () => {
  const payload = {
    updatedAt: '2026-08-03T00:00:00.000Z',
    boards: { en: [], zh: [{ title: 'STM32 固件开发实战' }] },
  };
  const raw = `// generated\nwindow.FEEDS = ${JSON.stringify(payload)};\n`;
  assert.deepEqual(parseGeneratedFeeds(raw), payload);
  assert.equal(parseGeneratedFeeds('window.FEEDS = not-json;'), null);
  assert.equal(parseGeneratedFeeds('window.OTHER = {};'), null);
});

test('fills domestic minimum only with revalidated unique previous technical items', () => {
  const current = [
    item('STM32 FreeRTOS 固件开发教程', 5000, 'strict-1'),
    item('边缘 AI 模型部署到 MCU', 6000, 'strict-2'),
  ];
  const previous = [
    {
      title: 'AI 芯片公司完成新一轮融资',
      summary: '',
      link: 'https://example.com/finance',
      source: 'Previous',
      date: '2026-07-31',
      lang: 'zh',
    },
    {
      title: '鸿蒙 ArkUI 组件性能优化与开发实践',
      summary: '面向端侧应用的组件性能分析。',
      link: 'https://example.com/previous-arkui',
      source: 'Previous Tech',
      date: '2026-07-31',
      lang: 'zh',
    },
    {
      title: '鸿蒙 ArkUI 组件性能优化与开发实践（二）',
      summary: '',
      link: 'https://example.com/previous-arkui-duplicate',
      source: 'Duplicate',
      date: '2026-07-30',
      lang: 'zh',
    },
    {
      title: 'STM32 FreeRTOS 固件开发教程进阶',
      summary: '',
      link: current[0].link,
      source: 'Duplicate Link',
      date: '2026-07-30',
      lang: 'zh',
    },
    {
      title: 'RuleGo 工业协议驱动开发实战',
      summary: '覆盖设备接入、协议解析和调试。',
      link: 'https://example.com/previous-rulego',
      source: 'Previous Tech',
      date: '2026-07-29',
      lang: 'zh',
    },
    {
      title: '物联网固件开发教程',
      summary: '',
      link: 'javascript:alert(1)',
      source: 'Unsafe',
      date: '2026-07-28',
      lang: 'zh',
    },
  ];

  const merged = mergeDomesticWithPrevious(current, previous, 4);

  assert.deepEqual(merged.map((entry) => entry.title), [
    'STM32 FreeRTOS 固件开发教程',
    '边缘 AI 模型部署到 MCU',
    '鸿蒙 ArkUI 组件性能优化与开发实践',
    'RuleGo 工业协议驱动开发实战',
  ]);
  assert.equal(merged[2].source, 'Previous Tech');
  assert.equal(merged[2].date, '2026-07-31');
  assert.ok(merged.every((entry) => entry.lang === 'zh'));
});

test('does not insert previous items when current domestic set already exceeds the minimum', () => {
  const current = [
    item('STM32 固件开发教程', 1000, 'current-1'),
    item('ESP32 固件调试实战', 2000, 'current-2'),
    item('Zephyr 设备驱动开发', 3000, 'current-3'),
    item('TinyML 模型部署优化', 4000, 'current-4'),
    item('RISC-V 裸机编程', 5000, 'current-5'),
  ];
  const merged = mergeDomesticWithPrevious(current, [
    item('鸿蒙 ArkUI 组件开发实践', 6000, 'previous'),
  ], 4);
  assert.deepEqual(merged.map((entry) => entry.title), current.map((entry) => entry.title));
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
