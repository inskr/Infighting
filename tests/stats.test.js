'use strict';

/* ============================================================
 * Infighting 统计模块 - formatCount 纯函数单元测试
 * 仅依赖模块导出的纯函数，无需浏览器 / 存储环境。
 * 运行：node tests/stats.test.js
 * ============================================================ */

var Stats = require("../assets/js/stats.js");
var formatCount = Stats.formatCount;

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

console.log("\n[formatCount] 数字缩写");
assert(formatCount(0) === "0", "formatCount(0) -> '0'", formatCount(0));
assert(formatCount(999) === "999", "formatCount(999) -> '999'", formatCount(999));
assert(formatCount(1000) === "1k", "formatCount(1000) -> '1k'", formatCount(1000));
assert(formatCount(1234) === "1.2k", "formatCount(1234) -> '1.2k'", formatCount(1234));
assert(formatCount(1500) === "1.5k", "formatCount(1500) -> '1.5k'", formatCount(1500));
assert(formatCount(123456) === "123k", "formatCount(123456) -> '123k'", formatCount(123456));

console.log("\n========================================");
console.log("测试结果汇总：PASS " + PASS + " / FAIL " + FAIL);
console.log("========================================");
process.exit(FAIL === 0 ? 0 : 1);
