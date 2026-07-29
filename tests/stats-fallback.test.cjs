'use strict';

/* ============================================================
 * QA：模拟 GitHub Pages 纯静态场景，验证 stats.js 的 abacus 回退模式
 *   - 不启动 Express 后端；使用可控的 fetch 适配器
 *   - 设置 global.window.POSTS，require stats.js 触发浏览器分支挂到 window.Stats
 *   - 同源统计探测返回 404 后回退到 abacus
 * 运行：node tests/stats-fallback.test.cjs
 * ============================================================ */

// 模拟浏览器全局（必须在 require 之前设置）
global.window = {
  POSTS: [
    { id: 'qa-abacus-purestatic' }
  ]
};

// 可控的 abacus 适配器：测试不依赖公网，也不会污染真实计数。
const counters = new Map();
global.fetch = async function (input) {
  const url = String(input);
  if (url.startsWith('/api/')) {
    return { ok: false, status: 404, json: async () => ({}) };
  }
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const operation = parts[0];
  const key = parts[2];
  if (operation === 'hit') counters.set(key, (counters.get(key) || 0) + 1);
  return {
    ok: true,
    status: 200,
    json: async () => ({ value: counters.get(key) || 0 })
  };
};

const Stats = require('../public/assets/js/stats.js') || global.window.Stats;
// stats.js 在有 window 时只挂 window.Stats、不导出 module.exports 之外的内容；
// 取 window.Stats 即可。
const S = (global.window && global.window.Stats) || Stats;

let PASS = 0;
let FAIL = 0;
function ok(cond, name, detail) {
  if (cond) {
    PASS++;
    console.log('  ✅ PASS  ' + name);
  } else {
    FAIL++;
    console.log('  ❌ FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

const ID = 'qa-abacus-purestatic';

(async function () {
  console.log('\n====== [abacus 回退模式测试] ======');

  // 1) 初始模式未探测
  ok(S.getMode() === 'unknown', '初始模式 = unknown', S.getMode());

  // 2) fetchAllStats 触发探测，因后端不可用 → abacus
  await S.fetchAllStats();
  ok(S.getMode() === 'abacus', '探测后模式 = abacus', S.getMode());

  // 3) 记录初始 viewCount
  const cache0 = S.getCache()[ID] || { viewCount: 0, likeCount: 0 };
  const v0 = cache0.viewCount;
  const l0 = cache0.likeCount;
  console.log('  ℹ️  初始 viewCount=' + v0 + ', likeCount=' + l0);

  // 4) 上报浏览 +1
  const v1 = await S.reportView(ID);
  ok(v1 === v0 + 1, 'reportView 后 viewCount = 初始+1', v1 + ' vs ' + (v0 + 1));

  // 5) 再上报浏览 +1
  const v2 = await S.reportView(ID);
  ok(v2 === v0 + 2, '再次 reportView 后 viewCount = 初始+2', v2 + ' vs ' + (v0 + 2));

  // 6) fetchStats 单条拉取应与缓存一致
  const one = await S.fetchStats(ID);
  ok(one && one.viewCount === v0 + 2, 'fetchStats viewCount = 初始+2', one && one.viewCount);

  // 7) 上报点赞 +1（可累加）
  const l1 = await S.reportLike(ID);
  ok(l1 === l0 + 1, 'reportLike 后 likeCount = 初始+1', l1 + ' vs ' + (l0 + 1));

  // 8) 批量拉取后缓存同步
  await S.fetchAllStats();
  const cached = S.getCache()[ID];
  ok(cached && cached.likeCount === l0 + 1, 'fetchAllStats 后 likeCount 同步', cached && cached.likeCount);

  console.log('\n========== [abacus 回退模式测试] 汇总 ==========');
  console.log('PASS ' + PASS + ' / FAIL ' + FAIL);
  delete global.fetch;
  delete global.window;
  process.exit(FAIL ? 1 : 0);
})().catch(function (e) {
  console.error('测试异常：', e);
  process.exit(1);
});
