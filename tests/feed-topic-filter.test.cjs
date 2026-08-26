'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  assertPublishableBoards,
  classifyTopic,
  collectBoard,
  extractArticleText,
  isDeepDomesticTechnicalContent,
  isDomesticTechnicalContent,
  isTopicRelevant,
  mergeDomesticWithPrevious,
  mergeArchive,
  parseCnblogsCategoryPage,
  parseGeneratedFeeds,
  selectBoardItems,
} = require('../scripts/fetch-feeds');

const DEEP_EMBEDDED_BODY = `
  本文在 STM32H7 与 FreeRTOS 开发板上实现摄像头边缘 AI 推理。首先配置设备树、
  DMA 与中断，再交叉编译固件并烧录。模型经过 INT8 量化后通过 TFLite Micro 部署，
  文中给出驱动代码、寄存器配置、内存映射、编译参数和串口调试日志。性能测试包含
  推理延迟、RAM 占用、Flash 占用、功耗与准确率对比，并分析缓存、算子和线程调度优化。
`.repeat(8);

function feedItem(title, age, slug) {
  return {
    title,
    summary: '',
    link: `https://example.com/${slug}`,
    source: 'Fixture',
    date: '2026-08-03',
    _ts: Date.parse('2026-08-03T00:00:00Z') - age,
  };
}

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

test('archive merge removes domestic news and legacy relaxed fallbacks', () => {
  const domesticPractice = {
    title: 'ESP32 driver source code analysis and debugging tutorial',
    link: 'https://example.com/zh-practice',
    source: 'Fixture', date: '2026-08-02',
    summary: 'Includes code and debugging steps.', lang: 'zh', depthVerified: true,
  };
  const domesticRelease = {
    title: 'ESP32 new edge AI developer board release',
    link: 'https://example.com/zh-release',
    source: 'Fixture', date: '2026-08-02',
    summary: 'The new product was formally announced.', lang: 'zh',
  };
  const selectedDomesticFallback = {
    ...domesticRelease,
    title: 'New sensor announced',
    link: 'https://example.com/zh-selected-fallback',
    selectionTier: 'relaxed',
  };
  const internationalRelease = {
    title: 'New Jetson edge AI developer kit adds an NPU',
    link: 'https://example.com/en-release',
    source: 'Fixture', date: '2026-08-02', summary: '', lang: 'en',
  };
  const archive = { days: [{
    date: '2026-08-02',
    boards: {
      zh: [domesticPractice, domesticRelease, selectedDomesticFallback],
      en: [internationalRelease],
    },
  }] };

  const merged = mergeArchive(archive, { zh: [], en: [] }, '2026-08-03T12:00:00.000Z');
  const previous = merged.days.find((day) => day.date === '2026-08-02');

  assert.deepEqual(previous.boards.zh.map((item) => item.title), [
    domesticPractice.title,
  ]);
  assert.deepEqual(previous.boards.en.map((item) => item.title), [internationalRelease.title]);
});

test('archive removes domestic items that were never verified from article bodies', () => {
  const verified = {
    title: 'STM32 固件驱动调试实战', link: 'https://example.com/verified',
    source: 'Fixture', date: '2026-08-02', summary: '', lang: 'zh', depthVerified: true,
  };
  const shallowOnly = {
    title: '边缘 AI 模型部署实战', link: 'https://example.com/shallow',
    source: 'Fixture', date: '2026-08-02',
    summary: '包含配置、部署和性能测试。', lang: 'zh',
  };

  const merged = mergeArchive(
    { days: [{ date: '2026-08-02', boards: { zh: [verified, shallowOnly] } }] },
    { zh: [] },
    '2026-08-03T12:00:00.000Z'
  );

  assert.deepEqual(
    merged.days.find((day) => day.date === '2026-08-02').boards.zh,
    [verified]
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

test('domestic selection never pads strict picks with related releases', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const items = [
    {
      title: 'STM32 FreeRTOS low-power configuration tutorial',
      summary: 'Includes code, compiler configuration, and power test results.',
      link: 'https://example.com/practice-1', source: 'Fixture',
      date: '2026-08-03', _ts: now,
    },
    {
      title: 'ESP32 Wi-Fi driver source analysis guide',
      summary: 'Includes source code, configuration, and debugging steps.',
      link: 'https://example.com/practice-2', source: 'Fixture',
      date: '2026-08-03', _ts: now - 1000,
    },
    {
      title: 'New sensor announced',
      summary: 'The new product was formally announced today.',
      link: 'https://example.com/release-1', source: 'Fixture',
      date: '2026-08-03', _ts: now - 2000,
    },
    {
      title: 'Bluetooth module announcement',
      summary: 'A new camera module was launched today.',
      link: 'https://example.com/release-2', source: 'Fixture',
      date: '2026-08-03', _ts: now - 3000,
    },
    {
      title: 'Industrial automation update',
      summary: 'The product was released today.',
      link: 'https://example.com/release-3', source: 'Fixture',
      date: '2026-08-03', _ts: now - 4000,
    },
    {
      title: 'Edge AI startup raises 10 million in a new round',
      summary: '', link: 'https://example.com/finance', source: 'Fixture',
      date: '2026-08-03', _ts: now - 500,
    },
  ];

  assert.deepEqual(
    selectBoardItems(items, 'zh', now).map((item) => item.title),
    [
      'STM32 FreeRTOS low-power configuration tutorial',
      'ESP32 Wi-Fi driver source analysis guide',
    ]
  );
});

test('domestic selection does not add relaxed items after four strict items', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const strictTitles = [
    'STM32 interrupt configuration tutorial',
    'ESP32 driver source code analysis guide',
    'Zephyr device tree debugging practice',
    'FreeRTOS queue implementation walkthrough',
  ];
  const items = strictTitles.map((title, index) => ({
    title,
    summary: 'Includes code, configuration, and debugging steps.',
    link: `https://example.com/strict-${index}`,
    source: 'Fixture', date: '2026-08-03', _ts: now - index * 1000,
  }));
  items.push({
    title: 'New STM32 edge AI developer board release',
    summary: '', link: 'https://example.com/relaxed', source: 'Fixture',
    date: '2026-08-03', _ts: now + 1000,
  });

  assert.deepEqual(
    selectBoardItems(items, 'zh', now).map((item) => item.title),
    strictTitles
  );
});

test('publication gate rejects fewer than eight final domestic items', () => {
  assert.throws(
    () => assertPublishableBoards({ en: [], zh: [{}, {}, {}, {}, {}, {}, {}] }),
    /Domestic daily picks require at least 8 items; got 7/
  );
  assert.doesNotThrow(() =>
    assertPublishableBoards({ en: [], zh: [{}, {}, {}, {}, {}, {}, {}, {}] })
  );
});

test('one failed domestic source does not discard successful sources', async () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const xml = `
    <rss><channel><item>
      <title>STM32 FreeRTOS firmware development tutorial</title>
      <link>https://example.com/story</link>
      <pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate>
      <description>Includes source code, configuration, and debugging steps.</description>
    </item></channel></rss>`;
  const fetcher = async (url) => {
    if (url.endsWith('/failed')) throw new Error('fixture failure');
    return xml;
  };

  const selected = await collectBoard([
    { name: 'Failed', url: 'https://example.com/failed' },
    { name: 'Working', url: 'https://example.com/working' },
  ], 'zh', fetcher, now, async () => `<article>${DEEP_EMBEDDED_BODY}</article>`);

  assert.deepEqual(selected.map((item) => item.title), [
    'STM32 FreeRTOS firmware development tutorial',
  ]);
});

test('extracts readable article text without scripts, styles, or navigation', () => {
  const html = `<!doctype html><html><body>
    <nav>首页 产品 新闻</nav>
    <article><h1>STM32 边缘 AI 部署实战</h1><p>配置 DMA 与摄像头驱动。</p>
    <pre><code>HAL_DMA_Start(&amp;hdma);</code></pre></article>
    <script>window.tracker = 'noise';</script><style>.ad { display:none }</style>
    <footer>版权信息</footer></body></html>`;

  assert.equal(
    extractArticleText(html),
    'STM32 边缘 AI 部署实战 配置 DMA 与摄像头驱动。 HAL_DMA_Start(&hdma);'
  );
});

test('extracts only the post body from a cnblogs page', () => {
  const html = `<html><body>
    <div class="postBody"><div id="cnblogs_post_body" class="blogpost-body">
      <h2>Linux 嵌入式 I2S 驱动调试</h2><p>配置设备树并检查 DMA 中断日志。</p>
      <div><pre>devm_snd_soc_register_component()</pre></div>
    </div></div>
    <div id="MySignature"></div>
    <div class="sidebar">某公司发布新品并举办行业峰会活动</div>
  </body></html>`;

  assert.equal(
    extractArticleText(html),
    'Linux 嵌入式 I2S 驱动调试 配置设备树并检查 DMA 中断日志。 devm_snd_soc_register_component()'
  );
});

test('deep domestic gate requires an embedded or edge AI topic with engineering evidence', () => {
  assert.equal(isDeepDomesticTechnicalContent({
    title: 'STM32H7 摄像头边缘 AI 部署与性能优化实战',
    summary: '包含模型量化、固件部署与性能测试。',
    articleText: DEEP_EMBEDDED_BODY,
  }), true);

  assert.equal(isDeepDomesticTechnicalContent({
    title: '某芯片公司发布全新 MCU 产品',
    summary: '新品在行业峰会正式亮相。',
    articleText: '该公司宣布新品发布并介绍市场计划。'.repeat(80),
  }), false);

  assert.equal(isDeepDomesticTechnicalContent({
    title: 'Milvus 向量数据库集群调优实战',
    summary: '包含索引、检索和服务部署。',
    articleText: '本文给出 API、索引、集群日志与性能测试步骤。'.repeat(80),
  }), false);
});

test('deep domestic gate accepts a long MCU analysis with two concrete evidence types', () => {
  const articleText = (
    '本文解析 MCU 深度休眠的寄存器配置、唤醒顺序与时钟门控，并给出性能对比。'
  ).repeat(30);

  assert.equal(isDeepDomesticTechnicalContent({
    title: 'MCU 低功耗模式解析：时钟门控与深度休眠',
    summary: '从硬件状态机分析低功耗工作模式。',
    articleText,
  }), true);
});

test('domestic collection verifies candidate article bodies before publishing them', async () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const xml = `<rss><channel><item>
    <title>STM32H7 边缘 AI 模型部署实战</title>
    <link>https://example.com/deep-article</link>
    <pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate>
    <description>固件开发与模型量化教程。</description>
  </item></channel></rss>`;
  const fetchedArticles = [];

  const selected = await collectBoard(
    [{ name: '专业嵌入式源', url: 'https://example.com/feed' }],
    'zh',
    async () => xml,
    now,
    async (url) => {
      fetchedArticles.push(url);
      return `<article>${DEEP_EMBEDDED_BODY}</article>`;
    }
  );

  assert.deepEqual(fetchedArticles, ['https://example.com/deep-article']);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].depthVerified, true);
  assert.equal(Object.hasOwn(selected[0], 'articleText'), false);
});

test('domestic collection does not fetch stale candidate article bodies', async () => {
  const now = Date.parse('2026-08-23T00:00:00Z');
  const xml = `<rss><channel><item>
    <title>STM32 FreeRTOS 固件开发教程</title>
    <link>https://example.com/stale-article</link>
    <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate>
    <description>包含源码、配置和调试步骤。</description>
  </item></channel></rss>`;
  let articleFetchCount = 0;

  const selected = await collectBoard(
    [{ name: '普通源', url: 'https://example.com/feed' }],
    'zh',
    async () => xml,
    now,
    async () => {
      articleFetchCount += 1;
      return `<article>${DEEP_EMBEDDED_BODY}</article>`;
    }
  );

  assert.equal(articleFetchCount, 0);
  assert.deepEqual(selected, []);
});

test('parses cnblogs category cards into dated feed candidates', () => {
  const html = `<section>
    <article class="post-item">
      <a class="post-item-title" href="https://www.cnblogs.com/demo/p/100" target="_blank">STM32 DMA 驱动调试实战</a>
      <p class="post-item-summary"><a href="/demo"><img alt="头像"></a>包含设备树配置、源码和性能测试。</p>
      <footer><span>2026-08-21 17:34</span></footer>
    </article>
    <article class="post-item">
      <a class="post-item-title" href="javascript:alert(1)">不安全链接</a>
      <p class="post-item-summary">应被丢弃</p><footer><span>2026-08-20 09:00</span></footer>
    </article>
  </section>`;

  assert.deepEqual(parseCnblogsCategoryPage(html, '博客园嵌入式'), [{
    title: 'STM32 DMA 驱动调试实战',
    link: 'https://www.cnblogs.com/demo/p/100',
    source: '博客园嵌入式',
    date: '2026-08-21',
    summary: '包含设备树配置、源码和性能测试。',
    _ts: Date.parse('2026-08-21T17:34:00+08:00'),
  }]);
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

test('matches ASCII keywords only at alphanumeric boundaries', () => {
  assert.equal(classifyTopic({ title: 'Airtable workspace update', summary: '' }), 'irrelevant');
  assert.equal(classifyTopic({ title: 'Tableau dashboard update', summary: '' }), 'irrelevant');
  assert.equal(
    classifyTopic({ title: 'Bipolar sensor firmware evaluation tutorial', summary: '' }),
    'strict'
  );
});

test('current corporate and LLM policy stories are not strict domestic picks', () => {
  const rejected = [
    {
      title: '现代起亚推动芯片供应本土化：首款韩产车用 MCU 量产',
      summary: '供应链与量产产业新闻。',
    },
    {
      title: '甲骨文对 OpenJDK 项目禁止 AI 生成代码',
      summary: '项目贡献政策与 pull request 规则更新。',
    },
    {
      title: 'Rust 项目团队宣布 LLM 政策：不禁止，但需披露代码来源',
      summary: '开源社区贡献政策新闻。',
    },
  ];

  for (const entry of rejected) assert.notEqual(classifyTopic(entry), 'strict', entry.title);
});

test('domestic technical gate admits concrete software engineering workflows', () => {
  const accepted = [
    {
      title: '从创建到发布：一套基于 AgentLoop 的 AI Agent Skill 持续调优工程链路',
      summary: '本文介绍一套基于阿里云 Agent 观测与优化平台 AgentLoop 的 Skill 评估与优化最佳实践，覆盖从 Skill 创建、可观测接入、离线评估、Bad Case 分析到迭代优化的完整闭环，',
    },
    {
      title: 'DataBuff v0.1.7 发布 · 平台自监控与自排障',
      summary: 'DataBuff 是一款面向云原生与微服务场景的开源 AI Native OpenTelemetry APM，采用 OTLP 标准接入、Apache Doris 统一存储，Web 端提供拓扑 / Trace / 指标与多 Agent 排障。',
    },
    {
      title: 'Milvus向量数据库实战：从零搭建AI日记助手的RAG完整链路',
      summary: '从AI日记助手拆解Milvus向量数据库的RAG链路：Embedding向量化、Collection创建、IVF_FLAT索引、语义检索到LLM生成回答。',
    },
    {
      title: 'HeteroFlow 异构算力调度平台于 2026 年 8 月 8 日推理服务正式发布',
      summary: '用一套 OpenAI 兼容 API，统一调度 9 种厂商 GPU 与 5 种推理引擎，原生支持多租户、扩缩容和热加载。',
    },
    {
      title: 'Easysearch 2.3.1 发布：强化集群运维能力，优化写入性能与稳定性体验',
      summary: '新增巡检信息采集能力，增强集群服务管理约束，优化文档写入与 mapping 解析性能，并修复 S3 兼容存储和 CCR 恢复问题。',
    },
  ];

  for (const item of accepted) {
    assert.equal(isDomesticTechnicalContent(item), true, item.title);
  }
});

test('domestic technical gate rejects manufacturing news with incidental implementation wording', () => {
  const item = {
    title: '现代起亚推动芯片供应本土化：首款韩产车用 MCU LX Semicon LX61101 量产',
    summary: '韩国系统半导体设计企业 LX Semicon 当地时间今日宣布已实现车用 MCU 芯片 LX61101 的量产。',
  };

  assert.equal(isDomesticTechnicalContent(item), false, item.title);
});

test('domestic technical gate rejects service incidents with incidental engineering terms', () => {
  const item = {
    title: 'GitHub 再次爆发大规模服务降级',
    summary: 'GitHub Actions 完全不可用超过 5 小时，coding agent 受影响，随后从调度层故障中恢复。',
  };

  assert.equal(isDomesticTechnicalContent(item), false, item.title);
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

test('fills the domestic minimum only with previously depth-verified technical items', () => {
  const current = [
    feedItem('STM32 FreeRTOS 固件开发教程', 1000, 'current-one'),
    feedItem('边缘 AI 模型部署实战', 2000, 'current-two'),
  ];
  const previous = [
    {
      ...feedItem('AI 芯片公司完成新一轮融资', 3000, 'finance'),
      source: 'Previous Finance', date: '2026-07-31', lang: 'zh',
    },
    {
      ...feedItem('鸿蒙 ArkUI 组件性能优化与开发实践', 4000, 'arkui'),
      summary: '边缘计算端侧应用的组件性能调试实践。',
      source: 'Previous Tech', date: '2026-07-31', lang: 'zh', depthVerified: true,
    },
    {
      ...feedItem('鸿蒙 ArkUI 组件性能优化与开发实践（二）', 5000, 'arkui-duplicate'),
      summary: '边缘计算端侧应用的组件性能调试实践。',
      source: 'Duplicate', date: '2026-07-30', lang: 'zh', depthVerified: true,
    },
    {
      ...feedItem('RuleGo 工业协议固件驱动开发实战', 6000, 'rulego'),
      source: 'Previous Tech', date: '2026-07-29', lang: 'zh', depthVerified: true,
    },
  ];

  const merged = mergeDomesticWithPrevious(current, previous, 4);

  assert.deepEqual(merged.map((entry) => entry.title), [
    'STM32 FreeRTOS 固件开发教程',
    '边缘 AI 模型部署实战',
    '鸿蒙 ArkUI 组件性能优化与开发实践',
    'RuleGo 工业协议固件驱动开发实战',
  ]);
  assert.equal(merged[2].source, 'Previous Tech');
  assert.equal(merged[2].date, '2026-07-31');
  assert.ok(merged.every((entry) => entry.lang === 'zh'));
});

test('allows an explicitly curated domestic engineering source to use its longer freshness window', () => {
  const now = Date.parse('2026-08-03T00:00:00Z');
  const oldTimestamp = now - 300 * 86400000;
  const items = [
    {
      title: 'STM32 设备树驱动开发实战',
      summary: '包含源码、配置与调试步骤。',
      link: 'https://example.com/default-window', source: 'General',
      date: '2025-10-07', _ts: oldTimestamp,
    },
    {
      title: 'Linux 嵌入式设备树驱动开发实战',
      summary: '包含源码、配置与调试步骤。',
      link: 'https://example.com/curated-window', source: 'Curated',
      date: '2025-10-07', _ts: oldTimestamp, maxAgeDays: 730,
    },
  ];

  assert.deepEqual(
    selectBoardItems(items, 'zh', now).map((item) => item.title),
    ['Linux 嵌入式设备树驱动开发实战']
  );
});

test('does not reuse a previous domestic item that lacks body-depth verification', () => {
  const previous = [
    feedItem('STM32 固件开发教程', 1000, 'legacy-unverified'),
    { ...feedItem('ESP32 驱动调试实战', 2000, 'verified'), depthVerified: true },
  ];

  assert.deepEqual(
    mergeDomesticWithPrevious([], previous, 2).map((entry) => entry.title),
    ['ESP32 驱动调试实战']
  );
});

test('deduplicates identical and near-identical short previous titles', () => {
  const previous = [
    { ...feedItem('固件教程', 1000, 'short-one'), date: '2026-07-31', depthVerified: true },
    { ...feedItem('固件教程', 2000, 'short-two'), date: '2026-07-30', depthVerified: true },
    { ...feedItem('固件教程上', 3000, 'short-near'), date: '2026-07-29', depthVerified: true },
    { ...feedItem('固件调试', 4000, 'short-debug'), date: '2026-07-28', depthVerified: true },
    { ...feedItem('STM32 驱动实战', 5000, 'short-driver'), date: '2026-07-27', depthVerified: true },
  ];

  const merged = mergeDomesticWithPrevious([], previous, 3);

  assert.deepEqual(merged.map((entry) => entry.title), [
    '固件教程',
    '固件调试',
    'STM32 驱动实战',
  ]);
});

test('does not insert previous items when the current domestic set meets the minimum', () => {
  const current = [
    feedItem('STM32 固件开发教程', 1000, 'enough-one'),
    feedItem('ESP32 固件调试实战', 2000, 'enough-two'),
    feedItem('Zephyr 设备驱动开发教程', 3000, 'enough-three'),
    feedItem('TinyML 模型部署优化实践', 4000, 'enough-four'),
    feedItem('RISC-V 裸机编程实战', 5000, 'enough-five'),
  ];

  const merged = mergeDomesticWithPrevious(current, [
    feedItem('鸿蒙 ArkUI 组件开发实践', 6000, 'previous'),
  ], 4);

  assert.deepEqual(merged.map((entry) => entry.title), current.map((entry) => entry.title));
});
