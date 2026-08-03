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
    { title: 'STM32 FreeRTOS 任务调度教程：从创建任务到优先级配置' },
    { title: 'ESP32 Wi-Fi 驱动源码解析与事件循环实现' },
    { title: '边缘 AI 模型在 Jetson 上的量化部署实战' },
    { title: '基于 Zephyr 的传感器驱动移植与调试踩坑记录' },
  ];

  assert.deepEqual(
    accepted.map((item) => isDomesticTechnicalContent(item)),
    [true, true, true, true]
  );
});

test('domestic admission keeps source-code analysis with 解读', () => {
  const item = {
    title: 'STM32 驱动源码解读与中断处理解析',
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
    { title: 'RuleGo v0.37.0 发布：全面支持工业协议与边缘计算' },
    { title: '新款 STM32 边缘 AI 开发板正式上市' },
    { title: '国产 MCU 厂商亮相嵌入式技术峰会' },
    { title: '2026 边缘计算产业趋势报告发布' },
    { title: '多地出台物联网产业扶持政策' },
    { title: 'STM32 新品发布解析' },
    { title: 'STM32 行业报告原理解析' },
  ];

  assert.deepEqual(
    rejected.map((item) => isDomesticTechnicalContent(item)),
    [false, false, false, false, false, false, false]
  );
});

test('domestic policy leakage rejects company news market events and commentary', () => {
  const rejected = [
    { title: 'STM32 开发公司与合作伙伴上线生态合作计划' },
    { title: 'STM32 实践沙龙活动在深圳举行' },
    { title: 'STM32 开发生态的解析与观点' },
  ];

  for (const item of rejected) {
    assert.equal(isDomesticTechnicalContent(item), false, item.title);
  }
});

test('domestic admission allows incidental company terminology in reproducible tutorials', () => {
  const accepted = [
    {
      title: 'STM32 HAL 驱动开发教程',
      summary: '本教程使用 ST 公司提供的 SDK。',
    },
    {
      title: '使用 ST 公司提供的 SDK：STM32 GPIO 驱动开发教程',
      summary: '从初始化到中断处理逐步演示。',
    },
  ];

  assert.deepEqual(
    accepted.map((item) => isDomesticTechnicalContent(item)),
    [true, true]
  );
});

test('domestic admission rejects company events despite weak engineering words', () => {
  const item = {
    title: 'STM32 驱动开发教程',
    summary: '某公司宣布合作计划，并在行业峰会上介绍驱动实现。',
  };

  assert.equal(isDomesticTechnicalContent(item), false, item.title);
});

test('domestic mixed release content requires title intent and summary evidence', () => {
  const cases = [
    {
      title: 'Zephyr 4.0 发布后的 STM32 驱动迁移实战',
      summary: '本文给出设备树修改、编译配置、烧录步骤和调试结果。',
      want: true,
    },
    {
      title: 'Zephyr 4.0 正式发布，新增 STM32 驱动支持',
      summary: '新版本改进了嵌入式设备支持。',
      want: false,
    },
    {
      title: 'Zephyr 4.0 正式发布，新增 STM32 驱动支持',
      summary: '附设备树修改、编译配置和烧录步骤。',
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

test('rejects acquisition euphemisms while keeping technical uses of eyeing', () => {
  const cases = [
    {
      title: 'NXP Eying Ambarella: Is It About Automotive or Edge AI?',
      summary: 'Ambarella has transformed its computer-vision technology for edge AI applications.',
      want: false,
    },
    {
      title: 'Chipmaker eyeing an edge AI startup for its embedded portfolio',
      want: false,
    },
    {
      title: 'Qualcomm Eying Ambarella for Its Edge AI Portfolio',
      want: false,
    },
    {
      title: 'Intel eyeing Ambarella for embedded computer vision',
      want: false,
    },
    {
      title: 'Developers eyeing lower interrupt latency in STM32 firmware',
      want: true,
    },
    {
      title: 'Developers eyeing STM32 DMA latency in embedded firmware',
      want: true,
    },
  ];

  assert.deepEqual(
    cases.map(({ want, ...item }) => isTopicRelevant(item)),
    cases.map(({ want }) => want)
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

test('archive merge removes domestic news but preserves international releases', () => {
  const domesticPractice = {
    title: 'ESP32 driver source code analysis and debugging tutorial',
    link: 'https://example.com/zh-practice',
    source: 'Fixture', date: '2026-08-02',
    summary: 'Includes code and debugging steps.', lang: 'zh',
  };
  const domesticRelease = {
    title: 'ESP32 new edge AI developer board release',
    link: 'https://example.com/zh-release',
    source: 'Fixture', date: '2026-08-02',
    summary: 'The new product was formally announced.', lang: 'zh',
  };
  const internationalRelease = {
    title: 'New Jetson edge AI developer kit adds an NPU',
    link: 'https://example.com/en-release',
    source: 'Fixture', date: '2026-08-02', summary: '', lang: 'en',
  };
  const archive = { days: [{
    date: '2026-08-02',
    boards: { zh: [domesticPractice, domesticRelease], en: [internationalRelease] },
  }] };

  const merged = mergeArchive(archive, { zh: [], en: [] }, '2026-08-03T12:00:00.000Z');
  const previous = merged.days.find((day) => day.date === '2026-08-02');

  assert.deepEqual(previous.boards.zh.map((item) => item.title), [domesticPractice.title]);
  assert.deepEqual(previous.boards.en.map((item) => item.title), [internationalRelease.title]);
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

test('domestic selection does not pad with related release announcements', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'STM32 FreeRTOS low-power configuration tutorial',
      summary: 'Includes code, compiler configuration, and power test results.',
      link: 'https://example.com/practice', source: 'Fixture',
      date: '2026-08-03', _ts: now,
    },
    {
      title: 'RuleGo v0.37.0 release: industrial protocols and edge computing upgrades',
      summary: 'The new version was formally released today.',
      link: 'https://example.com/release', source: 'Fixture',
      date: '2026-08-03', _ts: now - 1000,
    },
  ];

  assert.deepEqual(
    selectBoardItems(items, 'zh', now).map((item) => item.title),
    ['STM32 FreeRTOS low-power configuration tutorial']
  );
});

test('international selection keeps the existing product-release policy', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const item = {
    title: 'New Jetson edge AI developer kit adds an NPU',
    summary: '', link: 'https://example.com/jetson', source: 'Fixture',
    date: '2026-08-03', _ts: now,
  };

  assert.deepEqual(
    selectBoardItems([item], 'en', now).map((entry) => entry.title),
    [item.title]
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
