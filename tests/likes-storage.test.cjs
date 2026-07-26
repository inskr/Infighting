'use strict';

/* ============================================================
 * Infighting 点赞防重复模块 - likes-storage.js 单元测试
 *
 * 测试三大场景：
 *   1. 内存降级模式（Node 默认无 window → useMemory=true）
 *   2. localStorage 持久化模式（mock window.localStorage）
 *   3. localStorage 不可用降级（mock 抛错的 localStorage → useMemory=true）
 *
 * 运行：node tests/likes-storage.test.cjs
 * ============================================================ */

var path = require('path');
var MODULE_PATH = path.join(__dirname, '..', 'assets', 'js', 'likes-storage.js');
var STORAGE_KEY = 'infighting:liked';

var PASS = 0;
var FAIL = 0;
var failures = [];

function ok(cond, name, detail) {
  if (cond) {
    PASS++;
    console.log('  ✅ PASS  ' + name);
  } else {
    FAIL++;
    var msg = name + (detail ? '  -> ' + detail : '');
    failures.push(msg);
    console.log('  ❌ FAIL  ' + msg);
  }
}

function arraysEqualUnordered(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  var sa = a.slice().sort();
  var sb = b.slice().sort();
  for (var i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

/* ---------- 简易 localStorage mock ---------- */
function createLocalStorageMock() {
  var store = {};
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, val) {
      store[key] = String(val);
    },
    removeItem: function (key) {
      delete store[key];
    },
    clear: function () {
      store = {};
    },
    _dump: function () {
      return JSON.parse(JSON.stringify(store));
    }
  };
}

/* ---------- 抛错的 localStorage mock（模拟隐私模式 / 配额超限） ---------- */
function createThrowingLocalStorageMock() {
  return {
    getItem: function () { throw new Error('SecurityError: localStorage disabled'); },
    setItem: function () { throw new Error('SecurityError: localStorage disabled'); },
    removeItem: function () { throw new Error('SecurityError: localStorage disabled'); },
    clear: function () { throw new Error('SecurityError: localStorage disabled'); }
  };
}

/* ---------- 加载模块（重新执行 IIFE 以重新探测 window/localStorage） ---------- */
function loadModule(windowObj) {
  delete require.cache[require.resolve(MODULE_PATH)];
  if (windowObj === null) {
    delete global.window;
  } else {
    global.window = windowObj;
  }
  return require(MODULE_PATH);
}

/* ============================================================
 * 场景一：内存降级模式（无 window）
 * ============================================================ */
console.log('\n====== [场景一] 内存降级模式（无 window） ======');

(function testMemoryMode() {
  var api = loadModule(null); // 删除 global.window → 内存模式

  console.log('\n[1.1] hasLiked 对未点赞 id 返回 false');
  ok(api.hasLiked('post-1') === false, 'hasLiked("post-1") 初始 = false', String(api.hasLiked('post-1')));

  console.log('\n[1.2] markLiked 后 hasLiked 返回 true');
  api.markLiked('post-1');
  ok(api.hasLiked('post-1') === true, 'markLiked("post-1") 后 hasLiked = true', String(api.hasLiked('post-1')));

  console.log('\n[1.3] 同一 id 重复 markLiked 幂等（无副作用）');
  api.markLiked('post-1');
  api.markLiked('post-1');
  ok(api.hasLiked('post-1') === true, '重复 markLiked 后仍 true', String(api.hasLiked('post-1')));
  var ids = api.getLikedIds();
  ok(ids.length === 1, 'getLikedIds 仅含 1 个 id（无重复）', JSON.stringify(ids));

  console.log('\n[1.4] 不同 id 互不影响');
  api.markLiked('post-2');
  ok(api.hasLiked('post-1') === true, 'post-1 仍 true', String(api.hasLiked('post-1')));
  ok(api.hasLiked('post-2') === true, 'post-2 为 true', String(api.hasLiked('post-2')));
  ok(api.hasLiked('post-3') === false, 'post-3 仍 false', String(api.hasLiked('post-3')));

  console.log('\n[1.5] getLikedIds 返回全部已标记 id');
  api.markLiked('post-3');
  var all = api.getLikedIds();
  ok(arraysEqualUnordered(all, ['post-1', 'post-2', 'post-3']),
     'getLikedIds = [post-1, post-2, post-3]', JSON.stringify(all));

  console.log('\n[1.6] clear 清空全部记录');
  api.clear();
  ok(api.hasLiked('post-1') === false, 'clear 后 post-1 = false', String(api.hasLiked('post-1')));
  ok(api.hasLiked('post-2') === false, 'clear 后 post-2 = false', String(api.hasLiked('post-2')));
  ok(api.getLikedIds().length === 0, 'clear 后 getLikedIds 为空', JSON.stringify(api.getLikedIds()));

  console.log('\n[1.7] hasLiked(null)/hasLiked(undefined) 安全返回 false');
  ok(api.hasLiked(null) === false, 'hasLiked(null) = false', String(api.hasLiked(null)));
  ok(api.hasLiked(undefined) === false, 'hasLiked(undefined) = false', String(api.hasLiked(undefined)));

  console.log('\n[1.8] markLiked(null)/markLiked(undefined) 不抛错且为 no-op');
  var threw = false;
  try {
    api.markLiked(null);
    api.markLiked(undefined);
  } catch (e) {
    threw = true;
  }
  ok(!threw, 'markLiked(null/undefined) 不抛异常', threw ? 'threw: ' + threw : '');
  ok(api.getLikedIds().length === 0, 'markLiked(null/undefined) 未写入任何记录', JSON.stringify(api.getLikedIds()));

  console.log('\n[1.9] 数字 id 与字符串 id 一致性（String 转换）');
  api.markLiked(123);
  ok(api.hasLiked('123') === true, 'markLiked(123) 后 hasLiked("123") = true', String(api.hasLiked('123')));
  ok(api.hasLiked(123) === true, 'markLiked(123) 后 hasLiked(123) = true', String(api.hasLiked(123)));
  api.clear();
})();

/* ============================================================
 * 场景二：localStorage 持久化模式（mock window.localStorage）
 * ============================================================ */
console.log('\n====== [场景二] localStorage 持久化模式 ======');

(function testLocalStorageMode() {
  var lsMock = createLocalStorageMock();
  var api = loadModule({ localStorage: lsMock });

  console.log('\n[2.1] hasLiked 对未点赞 id 返回 false');
  ok(api.hasLiked('a1') === false, 'hasLiked("a1") 初始 = false', String(api.hasLiked('a1')));

  console.log('\n[2.2] markLiked 后 hasLiked 返回 true，且写入 localStorage');
  api.markLiked('a1');
  ok(api.hasLiked('a1') === true, 'markLiked("a1") 后 hasLiked = true', String(api.hasLiked('a1')));
  var raw = lsMock.getItem(STORAGE_KEY);
  ok(raw !== null, 'localStorage 已写入 key=infighting:liked', String(raw));
  var parsed;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  ok(Array.isArray(parsed) && parsed.indexOf('a1') !== -1,
     'localStorage 值为 JSON 数组含 "a1"', JSON.stringify(parsed));

  console.log('\n[2.3] 同一 id 重复 markLiked 幂等（localStorage 无重复元素）');
  api.markLiked('a1');
  api.markLiked('a1');
  raw = lsMock.getItem(STORAGE_KEY);
  parsed = JSON.parse(raw);
  ok(parsed.length === 1, 'localStorage 数组仅 1 个元素（无重复）', JSON.stringify(parsed));

  console.log('\n[2.4] 不同 id 互不影响且均持久化');
  api.markLiked('a2');
  api.markLiked('a3');
  ok(api.hasLiked('a1') === true, 'a1 = true', String(api.hasLiked('a1')));
  ok(api.hasLiked('a2') === true, 'a2 = true', String(api.hasLiked('a2')));
  ok(api.hasLiked('a3') === true, 'a3 = true', String(api.hasLiked('a3')));
  ok(api.hasLiked('a4') === false, 'a4 = false', String(api.hasLiked('a4')));
  parsed = JSON.parse(lsMock.getItem(STORAGE_KEY));
  ok(arraysEqualUnordered(parsed, ['a1', 'a2', 'a3']),
     'localStorage 数组 = [a1, a2, a3]', JSON.stringify(parsed));

  console.log('\n[2.5] getLikedIds 返回全部已标记 id');
  var all = api.getLikedIds();
  ok(arraysEqualUnordered(all, ['a1', 'a2', 'a3']),
     'getLikedIds = [a1, a2, a3]', JSON.stringify(all));

  console.log('\n[2.6] 数据跨模块重载持久化（模拟页面刷新）');
  // 用同一个 lsMock 重新加载模块，验证数据恢复
  var api2 = loadModule({ localStorage: lsMock });
  ok(api2.hasLiked('a1') === true, '重载后 hasLiked("a1") = true（从 localStorage 恢复）', String(api2.hasLiked('a1')));
  ok(api2.hasLiked('a2') === true, '重载后 hasLiked("a2") = true', String(api2.hasLiked('a2')));
  ok(api2.hasLiked('a3') === true, '重载后 hasLiked("a3") = true', String(api2.hasLiked('a3')));
  ok(api2.hasLiked('a4') === false, '重载后 hasLiked("a4") = false', String(api2.hasLiked('a4')));

  console.log('\n[2.7] clear 清空 localStorage 与内存');
  api2.clear();
  ok(api2.hasLiked('a1') === false, 'clear 后 hasLiked("a1") = false', String(api2.hasLiked('a1')));
  ok(api2.getLikedIds().length === 0, 'clear 后 getLikedIds 为空', JSON.stringify(api2.getLikedIds()));
  ok(lsMock.getItem(STORAGE_KEY) === null, 'clear 后 localStorage key 已移除', String(lsMock.getItem(STORAGE_KEY)));

  console.log('\n[2.8] hasLiked(null)/hasLiked(undefined) 安全返回 false');
  ok(api2.hasLiked(null) === false, 'hasLiked(null) = false', String(api2.hasLiked(null)));
  ok(api2.hasLiked(undefined) === false, 'hasLiked(undefined) = false', String(api2.hasLiked(undefined)));

  console.log('\n[2.9] 脏数据容错：localStorage 存非 JSON / 非数组时 readSet 返回空');
  lsMock.setItem(STORAGE_KEY, 'not-a-json{{{');
  var api3 = loadModule({ localStorage: lsMock });
  ok(api3.getLikedIds().length === 0, '非 JSON → getLikedIds 为空', JSON.stringify(api3.getLikedIds()));
  ok(api3.hasLiked('anything') === false, '非 JSON → hasLiked = false', String(api3.hasLiked('anything')));
  // 非数组 JSON
  lsMock.setItem(STORAGE_KEY, JSON.stringify({ not: 'array' }));
  api3 = loadModule({ localStorage: lsMock });
  ok(api3.getLikedIds().length === 0, '非数组 JSON → getLikedIds 为空', JSON.stringify(api3.getLikedIds()));
  // 写入后应恢复正常
  api3.markLiked('recovered');
  ok(api3.hasLiked('recovered') === true, '脏数据后 markLiked 恢复正常', String(api3.hasLiked('recovered')));
})();

/* ============================================================
 * 场景三：localStorage 不可用降级（setItem 抛错 → 内存模式）
 * ============================================================ */
console.log('\n====== [场景三] localStorage 不可用降级（隐私模式） ======');

(function testDegradationMode() {
  var throwingLs = createThrowingLocalStorageMock();
  var api = loadModule({ localStorage: throwingLs });

  console.log('\n[3.1] 降级内存模式下基础功能正常');
  ok(api.hasLiked('d1') === false, 'hasLiked("d1") 初始 = false', String(api.hasLiked('d1')));
  api.markLiked('d1');
  ok(api.hasLiked('d1') === true, 'markLiked("d1") 后 hasLiked = true', String(api.hasLiked('d1')));

  console.log('\n[3.2] 降级模式下幂等 + 多 id 互不影响');
  api.markLiked('d1');
  api.markLiked('d2');
  ok(api.hasLiked('d1') === true, 'd1 = true', String(api.hasLiked('d1')));
  ok(api.hasLiked('d2') === true, 'd2 = true', String(api.hasLiked('d2')));
  ok(api.hasLiked('d3') === false, 'd3 = false', String(api.hasLiked('d3')));
  ok(api.getLikedIds().length === 2, 'getLikedIds 含 2 个 id', JSON.stringify(api.getLikedIds()));

  console.log('\n[3.3] 降级模式下 clear 正常工作');
  api.clear();
  ok(api.hasLiked('d1') === false, 'clear 后 d1 = false', String(api.hasLiked('d1')));
  ok(api.getLikedIds().length === 0, 'clear 后 getLikedIds 为空', JSON.stringify(api.getLikedIds()));

  console.log('\n[3.4] 降级模式下 null/undefined 安全');
  ok(api.hasLiked(null) === false, 'hasLiked(null) = false', String(api.hasLiked(null)));
  ok(api.hasLiked(undefined) === false, 'hasLiked(undefined) = false', String(api.hasLiked(undefined)));
  var threw = false;
  try { api.markLiked(null); api.markLiked(undefined); } catch (e) { threw = true; }
  ok(!threw, 'markLiked(null/undefined) 不抛异常', '');
})();

/* ============================================================
 * 场景四：API 完整性校验
 * ============================================================ */
console.log('\n====== [场景四] API 完整性校验 ======');

(function testApiShape() {
  var api = loadModule(null);
  console.log('\n[4.1] 模块导出包含全部 4 个公开方法');
  ok(typeof api.hasLiked === 'function', 'hasLiked 是函数', typeof api.hasLiked);
  ok(typeof api.markLiked === 'function', 'markLiked 是函数', typeof api.markLiked);
  ok(typeof api.getLikedIds === 'function', 'getLikedIds 是函数', typeof api.getLikedIds);
  ok(typeof api.clear === 'function', 'clear 是函数', typeof api.clear);

  console.log('\n[4.2] getLikedIds 返回数组类型');
  ok(Array.isArray(api.getLikedIds()), 'getLikedIds() 返回 Array', Object.prototype.toString.call(api.getLikedIds()));

  console.log('\n[4.3] 空字符串 id 处理（"" != null，应正常处理）');
  api.markLiked('');
  ok(api.hasLiked('') === true, 'markLiked("") 后 hasLiked("") = true', String(api.hasLiked('')));
  ok(api.getLikedIds().indexOf('') !== -1, 'getLikedIds 含 ""', JSON.stringify(api.getLikedIds()));
  api.clear();
})();

/* ============================================================
 * 场景五：模块导出与 window 挂载（UMD 兼容）
 * ============================================================ */
console.log('\n====== [场景五] UMD 导出与 window 挂载 ======');

(function testUmdExport() {
  var lsMock = createLocalStorageMock();
  var win = { localStorage: lsMock };
  var api = loadModule(win);

  console.log('\n[5.1] 有 window 时挂载 window.LikesStorage');
  ok(typeof win.LikesStorage === 'object', 'window.LikesStorage 已挂载', typeof win.LikesStorage);
  ok(win.LikesStorage === api, 'window.LikesStorage === module.exports', String(win.LikesStorage === api));
  ok(typeof win.LikesStorage.hasLiked === 'function', 'window.LikesStorage.hasLiked 是函数', '');

  console.log('\n[5.2] 无 window 时仅 module.exports 可用（不报错）');
  var apiNoWin = loadModule(null);
  ok(typeof apiNoWin.hasLiked === 'function', '无 window 时 module.exports.hasLiked 仍可用', '');
  ok(typeof global.window === 'undefined', 'global.window 未被设置', typeof global.window);
})();

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n========== [likes-storage 测试] 汇总 ==========');
console.log('PASS ' + PASS + ' / FAIL ' + FAIL);
if (failures.length) {
  console.log('失败项:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}

// 清理全局状态
delete global.window;
process.exit(FAIL === 0 ? 0 : 1);
