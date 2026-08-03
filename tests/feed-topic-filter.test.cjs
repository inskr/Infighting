'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isDomesticTechnicalContent,
  isTopicRelevant,
  mergeArchive,
  selectBoardItems,
} = require('../scripts/fetch-feeds');

test('admits embedded and edge AI engineering content', () => {
  const accepted = [
    { title: 'Building a low-power STM32 FreeRTOS sensor node' },
    { title: 'Deploying quantized TinyML inference on an MCU' },
    { title: 'New Jetson edge AI developer kit adds an NPU' },
    { title: 'NPU inference quantization for vision camera deployment' },
    { title: 'ARM Cortex-M33 exception handling tutorial' },
    { title: 'ARM Cortex-A78 exception handling tutorial' },
    { title: 'IMU sensor camera calibration guide' },
  ];

  for (const item of accepted) assert.equal(isTopicRelevant(item), true, item.title);
});

test('domestic admission keeps tutorials source analysis and engineering practice', () => {
  const accepted = [
    { title: 'STM32 FreeRTOS 浠诲姟璋冨害鏁欑▼锛氫粠鍒涘缓浠诲姟鍒颁紭鍏堢骇閰嶇疆' },
    { title: 'ESP32 Wi-Fi 椹卞姩婧愮爜瑙ｆ瀽涓庝簨浠跺惊鐜疄鐜?' },
    { title: '杈圭紭 AI 妯″瀷鍦?Jetson 涓婄殑閲忓寲閮ㄧ讲瀹炴垬' },
    { title: '鍩轰簬 Zephyr 鐨勪紶鎰熷櫒椹卞姩绉绘涓庤皟璇曡俯鍧戣褰?' },
  ];

  for (const item of accepted) {
    assert.equal(isDomesticTechnicalContent(item), true, item.title);
  }
});

test('domestic admission keeps source-code analysis with 解读', () => {
  const item = {
    title: 'STM32 source code \u9a71\u52a8\u6e90\u7801\u89e3\u8bfb\u4e0e\u4e2d\u65ad\u5904\u7406\u89e3\u6790',
  };

  assert.equal(isDomesticTechnicalContent(item), true, item.title);
});

test('domestic admission keeps technical principle analysis without source code', () => {
  const item = { title: 'STM32 中断原理解析' };

  assert.equal(isDomesticTechnicalContent(item), true, item.title);
});

test('domestic admission rejects general commentary with engineering words', () => {
  const item = { title: 'STM32 source code 开发观点' };

  assert.equal(isDomesticTechnicalContent(item), false, item.title);
});

test('domestic admission rejects releases products and industry news', () => {
  const rejected = [
    { title: 'RuleGo v0.37.0 鍙戝竷锛氬叏闈㈡敮鎸佸伐涓氬崗璁笌杈圭紭璁＄畻' },
    { title: '鏂版 STM32 杈圭紭 AI 寮€鍙戞澘姝ｅ紡涓婂競' },
    { title: '鍥戒骇 MCU 鍘傚晢浜浉宓屽叆寮忔妧鏈嘲浼?' },
    { title: '2026 杈圭紭璁＄畻浜т笟瓒嬪娍鎶ュ憡鍙戝竷' },
    { title: '澶氬湴鍑哄彴鐗╄仈缃戜骇涓氭壎鎸佹斂绛?' },
  ];

  for (const item of rejected) {
    assert.equal(isDomesticTechnicalContent(item), false, item.title);
  }
});

test('domestic policy leakage rejects company news market events and commentary', () => {
  const rejected = [
    { title: 'STM32 寮€鍙?鍏徃涓庡悎浣滀紮浼翠笂绾跨敓鎬佸悎浣滆鍒?' },
    { title: 'STM32 瀹炶返娌欓緳娲诲姩鍦ㄦ繁鍦充妇琛?' },
    { title: 'STM32 瀵屽簱鍜屽紑鍙戠敓鎬佺殑瑙ｆ瀽涓庤鐐?' },
  ];

  for (const item of rejected) {
    assert.equal(isDomesticTechnicalContent(item), false, item.title);
  }
});

test('domestic mixed release content requires title intent and summary evidence', () => {
  const cases = [
    {
      title: 'Zephyr 4.0 鍙戝竷鍚庣殑 STM32 椹卞姩杩佺Щ瀹炴垬',
      summary: '鏈枃缁欏嚭璁惧鏍戜慨鏀广€佺紪璇戦厤缃€佺儳褰曟楠ゅ拰璋冭瘯缁撴灉銆?',
      want: true,
    },
    {
      title: 'Zephyr 4.0 姝ｅ紡鍙戝竷锛屾柊澧?STM32 椹卞姩鏀寔',
      summary: '鏂扮増鏈敼杩涗簡宓屽叆寮忚澶囨敮鎸併€?',
      want: false,
    },
    {
      title: 'Zephyr 4.0 姝ｅ紡鍙戝竷锛屾柊澧?STM32 椹卞姩鏀寔',
      summary: '闄勮澶囨爲淇敼銆佺紪璇戦厤缃拰鐑у綍姝ラ銆?',
      want: false,
    },
  ];

  for (const { want, ...item } of cases) {
    assert.equal(isDomesticTechnicalContent(item), want, item.title);
  }
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

test('rejects finance and corporate morphology around embedded and edge AI terms', () => {
  const cases = [
    { title: 'Edge AI startup raises 10 million in a new round', want: false },
    { title: 'Embedded startup closes Series A funding', want: false },
    { title: 'Company plans to acquire embedded systems vendor', want: false },
    { title: 'Edge AI startup was acquired by a semiconductor company', want: false },
    { title: 'Acquisition of an embedded systems company is complete', want: false },
    { title: 'New edge AI company announces layoffs', want: false },
    { title: 'Embedded vendor laid off staff after restructuring', want: false },
    { title: 'Edge AI company names new CEO', want: false },
    { title: 'Embedded systems company named a new chief executive', want: false },
    { title: '美股边缘AI概念公司走强', want: false },
    { title: '港股嵌入式芯片公司今日上涨', want: false },
    { title: 'A股 STM32 芯片公司表现强势', want: false },
    { title: '边缘AI公司注册资本增至1亿元', want: false },
  ];

  for (const { title, want } of cases) {
    assert.equal(isTopicRelevant({ title }), want, title);
  }
});

test('distinguishes technical product releases from capital-market listings', () => {
  const cases = [
    {
      title: '新款STM32开发板正式上市，支持边缘AI推理',
      want: true,
    },
    { title: 'Edge AI startup files for an IPO', want: false },
    { title: 'Embedded company prepares an initial public offering', want: false },
    { title: 'STM32芯片公司申请上市', want: false },
    { title: '边缘AI公司拟上市', want: false },
    { title: '上市公司发布STM32开发板', want: false },
    { title: '嵌入式芯片公司挂牌上市', want: false },
  ];

  for (const { title, want } of cases) {
    assert.equal(isTopicRelevant({ title }), want, title);
  }
});

test('does not confuse technical uses of corporate morphology with corporate news', () => {
  const cases = [
    { title: 'STM32 data acquisition with an external ADC', want: true },
    { title: 'STM32 raises a GPIO interrupt during edge capture', want: true },
    { title: 'Round-robin scheduling on FreeRTOS', want: true },
  ];

  for (const { title, want } of cases) {
    assert.equal(isTopicRelevant({ title }), want, title);
  }
});

test('distinguishes technical acquisition compounds from corporate transactions', () => {
  const cases = [
    { title: 'Vendor guide to STM32 data acquisition using DMA', want: true },
    {
      title: 'Semiconductor company demonstrates STM32 data acquisition with an external ADC',
      want: true,
    },
    { title: 'Edge camera image acquisition pipeline on an ARM Cortex-M MCU', want: true },
    { title: 'Signal acquisition and filtering with an IMU sensor', want: true },
    { title: 'Company plans to acquire embedded systems vendor', want: false },
    { title: 'Edge AI company announces acquisition of embedded vendor', want: false },
    { title: 'Embedded vendor acquisition closes this quarter', want: false },
    { title: 'Company completes acquisition of MCU startup', want: false },
  ];

  assert.deepEqual(
    cases.map(({ title }) => ({ title, relevant: isTopicRelevant({ title }) })),
    cases.map(({ title, want }) => ({ title, relevant: want }))
  );
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

test('rejects a human echolocation study that only mentions the Cerebral Cortex journal', () => {
  assert.equal(
    isTopicRelevant({
      title: '人类能在十周内学会回声定位',
      summary: '研究人员在《Cerebral Cortex》期刊上发表了一项后续研究。',
    }),
    false
  );
});

test('rejects brokerage robot coverage with imu only inside Optimus', () => {
  assert.equal(
    isTopicRelevant({
      title: '中信证券：看好特斯拉机器人的量产和应用前景',
      summary: '特斯拉兼具领先的AI大模型技术，看好机器人的量产。特斯拉Optimus即将进入生产阶段。',
    }),
    false
  );
});

test('does not match a short ASCII keyword inside a larger word', () => {
  assert.equal(
    isTopicRelevant({
      title: 'Robot production outlook for Optimus',
      summary: 'Large model 大模型 platform',
    }),
    false
  );
});

test('rejects Chinese brokerage and research contexts even with embedded keywords', () => {
  const rejected = [
    { title: '中信证券：STM32 MCU device driver outlook' },
    { title: '券商看好 STM32 MCU device driver market' },
    { title: '研报：STM32 MCU device driver adoption' },
  ];

  for (const item of rejected) assert.equal(isTopicRelevant(item), false, item.title);
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

test('deduplicates links before selecting board items', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'Older STM32 firmware release',
      summary: '',
      link: 'https://example.com/shared-release',
      source: 'Older Source',
      date: '2026-08-01',
      _ts: Date.parse('2026-08-01T00:00:00Z'),
    },
    {
      title: 'Newer STM32 firmware release',
      summary: '',
      link: 'https://example.com/shared-release',
      source: 'Newer Source',
      date: '2026-08-02',
      _ts: Date.parse('2026-08-02T00:00:00Z'),
    },
  ];

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'Newer STM32 firmware release',
  ]);
});

test('excludes items older than 14 days and accepts the exact boundary', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'STM32 firmware just outside the freshness window',
      summary: '',
      link: 'https://example.com/stale',
      source: 'Fixture',
      date: '2026-07-19',
      _ts: now - 14 * 86400000 - 1,
    },
    {
      title: 'STM32 firmware exactly at the freshness boundary',
      summary: '',
      link: 'https://example.com/boundary',
      source: 'Fixture',
      date: '2026-07-20',
      _ts: now - 14 * 86400000,
    },
  ];

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'STM32 firmware exactly at the freshness boundary',
  ]);
});

test('orders selected board items newest first', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'STM32 bootloader deep dive Monday',
      summary: '',
      link: 'https://example.com/monday',
      source: 'Fixture',
      date: '2026-07-27',
      _ts: Date.parse('2026-07-27T00:00:00Z'),
    },
    {
      title: 'Zephyr device driver walkthrough Sunday',
      summary: '',
      link: 'https://example.com/sunday',
      source: 'Fixture',
      date: '2026-08-02',
      _ts: Date.parse('2026-08-02T00:00:00Z'),
    },
    {
      title: 'ESP32 low power sleep modes Friday',
      summary: '',
      link: 'https://example.com/friday',
      source: 'Fixture',
      date: '2026-07-31',
      _ts: Date.parse('2026-07-31T00:00:00Z'),
    },
  ];

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'Zephyr device driver walkthrough Sunday',
    'ESP32 low power sleep modes Friday',
    'STM32 bootloader deep dive Monday',
  ]);
});

test('deduplicates fuzzy title variants and keeps the newest one', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'STM32 RTOS driver tutorial for beginners',
      summary: '',
      link: 'https://example.com/older-tutorial',
      source: 'Older Source',
      date: '2026-08-01',
      _ts: Date.parse('2026-08-01T00:00:00Z'),
    },
    {
      title: 'Updated: STM32 RTOS driver tutorial for beginners',
      summary: '',
      link: 'https://example.com/newer-tutorial',
      source: 'Newer Source',
      date: '2026-08-02',
      _ts: Date.parse('2026-08-02T00:00:00Z'),
    },
  ];

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'Updated: STM32 RTOS driver tutorial for beginners',
  ]);
});

test('caps a board at eight items', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    ['STM32 interrupt latency alpha', 'alpha', 1],
    ['ESP32 deep sleep bravo', 'bravo', 2],
    ['Zephyr device tree charlie', 'charlie', 3],
    ['FreeRTOS queue patterns delta', 'delta', 4],
    ['TinyML quantization echo', 'echo', 5],
    ['Jetson camera pipeline foxtrot', 'foxtrot', 6],
    ['RISC-V vector extension golf', 'golf', 7],
    ['Arduino motor control hotel', 'hotel', 8],
    ['Yocto image recipes india', 'india', 9],
    ['Buildroot rootfs tuning juliet', 'juliet', 10],
  ].map(([title, slug, age]) => ({
    title,
    summary: '',
    link: `https://example.com/${slug}`,
    source: 'Fixture',
    date: '2026-08-02',
    _ts: now - age * 1000,
  }));

  const selected = selectBoardItems(items, 'en', now);

  assert.deepEqual(selected.map((item) => item.title), [
    'STM32 interrupt latency alpha',
    'ESP32 deep sleep bravo',
    'Zephyr device tree charlie',
    'FreeRTOS queue patterns delta',
    'TinyML quantization echo',
    'Jetson camera pipeline foxtrot',
    'RISC-V vector extension golf',
    'Arduino motor control hotel',
  ]);
});

test('does not mutate its caller-owned item array', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'Older STM32 firmware guide',
      summary: '',
      link: 'https://example.com/older',
      source: 'Fixture',
      date: '2026-08-01',
      _ts: Date.parse('2026-08-01T00:00:00Z'),
    },
    {
      title: 'Newer ESP32 firmware guide',
      summary: '',
      link: 'https://example.com/newer',
      source: 'Fixture',
      date: '2026-08-02',
      _ts: Date.parse('2026-08-02T00:00:00Z'),
    },
  ];
  const original = structuredClone(items);

  selectBoardItems(items, 'en', now);

  assert.deepEqual(items, original);
});
