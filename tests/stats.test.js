'use strict';

/* ============================================================
 * Infighting 统计模块（点赞 + 浏览）独立验证测试
 * 零第三方依赖：内联内存版 localStorage / sessionStorage mock。
 * 注意：必须在 require('../assets/js/stats.js') 之前挂到 global。
 * ============================================================ */

/* ---------- 内存版存储 mock ---------- */
function createMockStorage() {
  var map = {};
  return {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
    setItem: function (k, v) {
      map[k] = String(v);
    },
    removeItem: function (k) {
      delete map[k];
    },
    clear: function () {
      map = {};
    },
    _raw: function () {
      return map;
    }
  };
}

// 挂到 global（stats.js 通过 globalThis.localStorage / sessionStorage 访问）
global.localStorage = createMockStorage();
global.sessionStorage = createMockStorage();

var Stats = require("../assets/js/stats.js");

/* ---------- 简单断言 + 计数 ---------- */
var PASS = 0;
var FAIL = 0;

function assert(cond, name, extra) {
  if (cond) {
    PASS++;
    console.log("  ✅ PASS  " + name);
  } else {
    FAIL++;
    console.log("  ❌ FAIL  " + name + (extra ? "  -> " + extra : ""));
  }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function freshState() {
  global.localStorage.clear();
  global.sessionStorage.clear();
}

function readJSONFromLS(key) {
  var raw = global.localStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

/* ============================================================
 * 需求1：点赞 toggle（同一内容只能赞一次，不能叠加）
 * ============================================================ */
console.log("\n[需求1] 点赞 toggle 不能叠加");
freshState();

var r1 = Stats.toggleLike("post-like");
assert(eq(r1, { liked: true, count: 1 }), "全新 id 第一次 toggleLike -> {liked:true,count:1}", JSON.stringify(r1));
assert(eq(Stats.getLikeState("post-like"), { liked: true, count: 1 }), "getLikeState 与第1次 toggle 一致", JSON.stringify(Stats.getLikeState("post-like")));

var r2 = Stats.toggleLike("post-like");
assert(eq(r2, { liked: false, count: 0 }), "再调一次 toggleLike -> {liked:false,count:0}（取消，-1）", JSON.stringify(r2));
assert(eq(Stats.getLikeState("post-like"), { liked: false, count: 0 }), "getLikeState 与第2次 toggle 一致（证明不能叠加）", JSON.stringify(Stats.getLikeState("post-like")));

// 边界：非法 id 直接返回安全默认，不抛
var r0 = Stats.toggleLike("");
assert(eq(r0, { liked: false, count: 0 }), "空 id toggleLike -> 安全默认", JSON.stringify(r0));

/* ============================================================
 * 需求2：浏览防刷 recordView（防重复计数）
 * ============================================================ */
console.log("\n[需求2] 浏览防刷 recordView");
freshState();
var id = "post-view";
var sKey = "infighting.viewed:" + id;

// 1) 新会话 + lastViewAt 无记录 -> 返回 1，且 sessionStorage 被标记
var v1 = Stats.recordView(id);
assert(v1 === 1, "新会话首次 recordView -> 1", "got " + v1);
assert(global.sessionStorage.getItem(sKey) === "1", "sessionStorage 已标记本次会话已计浏览");

// 2) 同会话内立即再调 -> 仍为 1（依赖 session 标记）
var v2 = Stats.recordView(id);
assert(v2 === 1, "同会话再次 recordView -> 仍为 1（不重复计数）", "got " + v2);

// 3) 清掉 sessionStorage（模拟新会话），但 lastViewAt 是“刚刚”（冷却期内）-> 仍为 1
global.sessionStorage.clear();
var v3 = Stats.recordView(id);
assert(v3 === 1, "清 session 但仍在 30 分钟冷却期内 -> 仍为 1", "got " + v3);
assert(global.sessionStorage.getItem(sKey) === "1", "冷却期内同样标记本会话已计，避免后续立即重复");

// 4) 清掉 sessionStorage，且把 lastViewAt 改成 1 小时前（超过 30 分钟冷却）-> 返回 2
global.sessionStorage.clear();
var oneHourAgo = Date.now() - 60 * 60 * 1000;
global.localStorage.setItem(Stats.KEYS.lastViewAt, JSON.stringify({ [id]: oneHourAgo }));
var v4 = Stats.recordView(id);
assert(v4 === 2, "超出冷却期后 recordView -> 2（真实新增）", "got " + v4);
var vcReal = readJSONFromLS(Stats.KEYS.viewCounts);
assert(vcReal[id] === 2, "viewCounts 在 localStorage 中实际写入 2", JSON.stringify(vcReal));

// 边界：非法 id 直接返回 0，不抛
assert(Stats.recordView("") === 0, "空 id recordView -> 0");

/* ============================================================
 * 需求3a：数字缩写 formatCount
 * ============================================================ */
console.log("\n[需求3a] 数字缩写 formatCount");
assert(Stats.formatCount(0) === "0", "formatCount(0) -> '0'", Stats.formatCount(0));
assert(Stats.formatCount(999) === "999", "formatCount(999) -> '999'", Stats.formatCount(999));
assert(Stats.formatCount(1000) === "1k", "formatCount(1000) -> '1k'", Stats.formatCount(1000));
assert(Stats.formatCount(1234) === "1.2k", "formatCount(1234) -> '1.2k'", Stats.formatCount(1234));
assert(Stats.formatCount(1500) === "1.5k", "formatCount(1500) -> '1.5k'", Stats.formatCount(1500));
assert(Stats.formatCount(123456) === "123k", "formatCount(123456) -> '123k'", Stats.formatCount(123456));

/* ============================================================
 * 需求3b：持久化（刷新一致性）
 * ============================================================ */
console.log("\n[需求3b] 持久化（写入 + 模拟刷新后一致）");
freshState();
var pid = "post-persist";
Stats.toggleLike(pid);   // 写入 likes + likeCounts
Stats.recordView(pid);   // 写入 viewCounts + lastViewAt

var lc = readJSONFromLS(Stats.KEYS.likeCounts);
var vc = readJSONFromLS(Stats.KEYS.viewCounts);
assert(eq(lc, { [pid]: 1 }), "likeCounts 已写入 localStorage (JSON)", JSON.stringify(lc));
assert(eq(vc, { [pid]: 1 }), "viewCounts 已写入 localStorage (JSON)", JSON.stringify(vc));

// 清空 require 缓存并重新 require，模拟“刷新页面”
delete require.cache[require.resolve("../assets/js/stats.js")];
var Stats2 = require("../assets/js/stats.js");
var st = Stats2.getLikeState(pid);
var vt = Stats2.getViewCount(pid);
assert(eq(st, { liked: true, count: 1 }), "刷新后 getLikeState 仍一致（持久化生效）", JSON.stringify(st));
assert(vt === 1, "刷新后 getViewCount 仍一致", "got " + vt);

/* ============================================================
 * 需求5：存储异常容错（隐私模式 / 配额满）
 * ============================================================ */
console.log("\n[需求5] 存储异常容错（localStorage 抛错不崩溃）");
freshState();
global.localStorage.getItem = function () { throw new Error("storage unavailable"); };
global.localStorage.setItem = function () { throw new Error("storage unavailable"); };

var threw = false;
var results = {};
try {
  results.gs = Stats.getLikeState("x");
  results.tl = Stats.toggleLike("x");
  results.gv = Stats.getViewCount("x");
  results.rv = Stats.recordView("x");
} catch (e) {
  threw = true;
  FAIL++;
  console.log("  ❌ FAIL  容错测试中抛出异常 -> " + e.message);
}
assert(!threw, "所有统计 API 在存储异常时均不抛异常");
assert(eq(results.gs, { liked: false, count: 0 }), "getLikeState 异常下返回安全默认 {liked:false,count:0}", JSON.stringify(results.gs));
assert(eq(results.tl, { liked: false, count: 0 }), "toggleLike 异常下返回安全默认 {liked:false,count:0}", JSON.stringify(results.tl));
assert(results.gv === 0, "getViewCount 异常下返回 0", "got " + results.gv);
assert(results.rv === 0, "recordView 异常下返回 0（不 +1、不抛）", "got " + results.rv);

/* ============================================================
 * 汇总
 * ============================================================ */
console.log("\n========================================");
console.log("测试结果汇总：PASS " + PASS + " / FAIL " + FAIL);
console.log("========================================");
process.exit(FAIL === 0 ? 0 : 1);
