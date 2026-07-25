/* Infighting - 统计模块：点赞数 + 浏览数（纯前端 localStorage 持久化）
 * 兼容 UMD：浏览器挂到 window.Stats，Node 下可被 require（核心逻辑仅依赖
 * localStorage / sessionStorage 全局对象，不依赖 DOM，便于 QA 用 mock 测试）。
 */
(function (root) {
  "use strict";

  // 统一 key 前缀
  var PREFIX = "infighting.";
  var KEYS = {
    likes: PREFIX + "likes", // { [id]: true } 记录已点赞集合
    likeCounts: PREFIX + "likeCounts", // { [id]: number } 点赞总数
    viewCounts: PREFIX + "viewCounts", // { [id]: number } 浏览总数
    lastViewAt: PREFIX + "lastViewAt" // { [id]: timestamp } 上次浏览时间戳
  };

  // 浏览防刷冷却期：30 分钟内同一内容不重复计数
  var COOLDOWN_MS = 30 * 60 * 1000;

  /* ---------- 安全存储访问（隐私模式/配额满时不应抛错） ---------- */
  function getLS() {
    try {
      return root.localStorage;
    } catch (e) {
      return null;
    }
  }
  function getSS() {
    try {
      return root.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  // 读取 JSON 对象，任意异常均回退为空对象
  function readJSON(key) {
    var store = getLS();
    if (!store) return {};
    try {
      var raw = store.getItem(key);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }

  // 写入 JSON 对象，失败静默忽略
  function writeJSON(key, obj) {
    var store = getLS();
    if (!store) return;
    try {
      store.setItem(key, JSON.stringify(obj || {}));
    } catch (e) {
      /* 配额满或隐私模式：忽略 */
    }
  }

  // 数值保底为非负整数
  function toCount(v) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  /* ---------- 点赞相关 ---------- */
  // 取某内容项点赞状态：{ liked, count }
  function getLikeState(id) {
    var likes = readJSON(KEYS.likes);
    var counts = readJSON(KEYS.likeCounts);
    return {
      liked: !!likes[id],
      count: toCount(counts[id])
    };
  }

  // 切换点赞态：已赞则取消（-1），未赞则点赞（+1），返回最新状态
  function toggleLike(id) {
    if (!id) return { liked: false, count: 0 };
    var likes = readJSON(KEYS.likes);
    var counts = readJSON(KEYS.likeCounts);

    if (likes[id]) {
      delete likes[id];
      counts[id] = toCount(counts[id]) - 1;
    } else {
      likes[id] = true;
      counts[id] = toCount(counts[id]) + 1;
    }
    writeJSON(KEYS.likes, likes);
    writeJSON(KEYS.likeCounts, counts);
    return getLikeState(id);
  }

  /* ---------- 浏览相关 ---------- */
  // 取某内容项累计浏览数
  function getViewCount(id) {
    var counts = readJSON(KEYS.viewCounts);
    return toCount(counts[id]);
  }

  // 标记本次会话对该内容已计过浏览（同会话内刷新不再 +1）
  function markSessionViewed(store, key) {
    if (!store) return;
    try {
      store.setItem(key, "1");
    } catch (e) {
      /* 忽略 */
    }
  }

  // 记录一次浏览：执行防刷判断后累加，返回最新浏览数
  function recordView(id) {
    if (!id) return 0;
    var ss = getSS();
    var sessionKey = PREFIX + "viewed:" + id;

    // 1) 本会话已计过 → 直接返回当前浏览数（不 +1）
    if (ss) {
      try {
        if (ss.getItem(sessionKey)) {
          return getViewCount(id);
        }
      } catch (e) {
        /* 忽略 */
      }
    }

    var now = Date.now();
    var last = readJSON(KEYS.lastViewAt);
    var inCooldown = !!last[id] && now - toCount(last[id]) < COOLDOWN_MS;

    // 2) 冷却期内 → 不 +1，但仍标记本次会话已计，避免后续立即重复
    if (inCooldown) {
      markSessionViewed(ss, sessionKey);
      return getViewCount(id);
    }

    // 3) 真实新增浏览
    var counts = readJSON(KEYS.viewCounts);
    counts[id] = toCount(counts[id]) + 1;
    writeJSON(KEYS.viewCounts, counts);

    last[id] = now;
    writeJSON(KEYS.lastViewAt, last);

    // 4) 标记本会话已计（同会话刷新不再 +1）
    markSessionViewed(ss, sessionKey);
    return getViewCount(id);
  }

  /* ---------- 展示工具 ---------- */
  // 数字缩写：>=1000 显示为 1.2k 之类
  function formatCount(n) {
    n = toCount(n);
    if (n < 1000) return String(n);
    var k = n / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + "k";
  }

  var Stats = {
    getLikeState: getLikeState,
    toggleLike: toggleLike,
    getViewCount: getViewCount,
    recordView: recordView,
    formatCount: formatCount,
    KEYS: KEYS,
    COOLDOWN_MS: COOLDOWN_MS
  };

  // 暴露到全局与模块
  root.Stats = Stats;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Stats;
  }
  return Stats;
})(typeof globalThis !== "undefined" ? globalThis : this);
