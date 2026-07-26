/* Infighting - 点赞状态本地持久化模块（UMD）
 *
 * 使用 localStorage 存储用户已点赞的文章 ID 集合，实现前端防重复点赞。
 * 隐私模式 / localStorage 禁用时自动降级为内存对象（仅当次会话有效）。
 *
 * 兼容 UMD：浏览器挂到 window.LikesStorage，Node 下可被 require。
 * 约定：window / localStorage 只在函数体内或检测块中引用，保证 Node 端 require 不报错。
 */
(function () {
  "use strict";

  var STORAGE_KEY = "infighting:liked";

  /* ---------- 存储后端：localStorage 优先，不可用则降级内存 ---------- */
  var memorySet = {};
  var useMemory = true; // 默认内存模式，浏览器检测通过后切换为 localStorage

  if (typeof window !== "undefined") {
    try {
      var probe = "__infighting_probe__";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      useMemory = false;
    } catch (e) {
      useMemory = true; // 隐私模式 / 配额超限 / 被禁用 → 降级内存
    }
  }

  /* ---------- 内部：读取已点赞 ID 集合（返回 plain object 作 Set 用） ---------- */
  function readSet() {
    if (useMemory) {
      return memorySet;
    }
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      var set = {};
      for (var i = 0; i < arr.length; i++) {
        set[String(arr[i])] = true;
      }
      return set;
    } catch (e) {
      return {};
    }
  }

  /* ---------- 内部：写入已点赞 ID 集合 ---------- */
  function writeSet(set) {
    if (useMemory) {
      memorySet = set;
      return;
    }
    try {
      var arr = Object.keys(set);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      /* 写入失败（如配额超限）：静默降级到内存，保证本次会话防重复仍生效 */
      memorySet = set;
      useMemory = true;
    }
  }

  /* ---------- 公开 API ---------- */

  /**
   * 判断指定文章是否已被当前用户点赞。
   * @param {string|number} id 文章 ID
   * @returns {boolean}
   */
  function hasLiked(id) {
    if (id == null) return false;
    var set = readSet();
    return Object.prototype.hasOwnProperty.call(set, String(id));
  }

  /**
   * 标记指定文章为已点赞（持久化到 localStorage）。
   * @param {string|number} id 文章 ID
   */
  function markLiked(id) {
    if (id == null) return;
    var set = readSet();
    set[String(id)] = true;
    writeSet(set);
  }

  /**
   * 获取全部已点赞的文章 ID 列表。
   * @returns {string[]}
   */
  function getLikedIds() {
    return Object.keys(readSet());
  }

  /**
   * 清空全部已点赞记录（仅用于调试 / 重置）。
   */
  function clear() {
    if (useMemory) {
      memorySet = {};
      return;
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* 静默 */
    }
    memorySet = {};
  }

  /* ---------- 导出 ---------- */
  var api = {
    hasLiked: hasLiked,
    markLiked: markLiked,
    getLikedIds: getLikedIds,
    clear: clear
  };

  if (typeof window !== "undefined") {
    window.LikesStorage = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
