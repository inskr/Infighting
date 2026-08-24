/* Infighting - 统计模块（双模式：同源后端 / abacus 计数 API）
 *
 * 部署形态：
 *   1) 自托管 Node + Express + SQLite（本地 `node server.js` 或自有服务器）
 *      → 探测同源 /api/content/stats 可用，走后端，并发安全、自托管数据。
 *   2) GitHub Pages 等纯静态托管（无法运行后端）
 *      → 探测失败自动回退到 abacus 计数 API（https://abacus.jasoncameron.dev），
 *        跨设备真实计数，CORS 全开放，免注册。
 *
 * 接口形态两种模式一致：fetchAllStats / fetchStats / reportView / reportLike
 *   + getCache / formatCount，调用方（页面 Modules）无需感知模式差异。
 *
 * 兼容 UMD：浏览器挂到 window.Stats，Node 下可被 require（仅导出 formatCount 纯函数）。
 * 约定：window / fetch 只在函数体内引用，保证 Node 端 require 不报错。
 */
(function () {
  "use strict";

  /* ---------- 数值工具 ---------- */
  function toCount(v) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function formatCount(n) {
    n = toCount(n);
    if (n < 1000) return String(n);
    var k = n / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + "k";
  }

  /* ---------- 浏览器端统计缓存：{ [id]: { viewCount, likeCount } } ---------- */
  var statsCache = {};

  /* ---------- 模式：'unknown' | 'backend' | 'abacus' ----------
   * 首次调用任意接口时探测，结果缓存，后续不再重复探测。
   */
  var mode = "unknown";
  var BACKEND_STATS_URL = "/api/content/stats";

  /* ---------- abacus 配置 ----------
   * namespace 全站唯一，避免与他人冲突；key 由前缀 + 文章 id 组成。
   * abacus 的 hit 即 +1（GET），get 只读，均返回 { value: N }。
   */
  var ABACUS_BASE = "https://abacus.jasoncameron.dev";
  var ABACUS_NS = "inskr_infighting";

  // abacus namespace/key 仅允许 [A-Za-z0-9_-]，对文章 id 做清洗
  function sanitizeKey(s) {
    return String(s).replace(/[^A-Za-z0-9_-]/g, "_");
  }
  function abacusKeyView(id) {
    return "v_" + sanitizeKey(id);
  }
  function abacusKeyLike(id) {
    return "l_" + sanitizeKey(id);
  }

  // GET /get 为只读查询；加 no-store 防止浏览器 HTTP 缓存返回旧计数
  function abacusGet(key) {
    return fetch(
      ABACUS_BASE + "/get/" + ABACUS_NS + "/" + encodeURIComponent(key),
      { cache: "no-store" }
    )
      .then(function (res) {
        if (!res.ok) throw new Error("abacus http " + res.status);
        return res.json();
      })
      .then(function (json) {
        return toCount(json && json.value);
      })
      .catch(function () {
        return 0;
      });
  }

  // hit = +1 并返回最新值；失败返回 -1 表示"未变更"（便于调用方决定是否回退）
  // 关键：abacus /hit 是 GET 且带 +1 副作用，服务端未返回 Cache-Control，
  // 浏览器会启发式缓存响应，导致重复访问命中缓存、请求不到达服务端、计数不递增。
  // 因此必须显式 cache:"no-store" 绕过 HTTP 缓存（与 detectMode 一致）。
  function abacusHit(key) {
    return fetch(
      ABACUS_BASE + "/hit/" + ABACUS_NS + "/" + encodeURIComponent(key),
      { cache: "no-store" }
    )
      .then(function (res) {
        if (!res.ok) throw new Error("abacus http " + res.status);
        return res.json();
      })
      .then(function (json) {
        return toCount(json && json.value);
      })
      .catch(function () {
        return -1;
      });
  }

  /* ---------- 模式探测 ----------
   * 同源 GET /api/content/stats：HTTP 200 且返回 { code:0, data } → backend；
   * 否则（404 / 非 JSON / 网络错误）→ abacus。
   */
  function readBackendData(res) {
    return res.json().then(function (json) {
      if (!res.ok || !json || json.code !== 0) {
        throw new Error((json && json.message) || "backend http " + res.status);
      }
      return json.data;
    });
  }

  function detectMode() {
    if (mode !== "unknown") return Promise.resolve(mode);
    return fetch(BACKEND_STATS_URL, { cache: "no-store" })
      .then(readBackendData)
      .then(function (data) {
        if (!data || typeof data !== "object") throw new Error("invalid backend data");
        mode = "backend";
        statsCache = data;
        return mode;
      })
      .catch(function () {
        mode = "abacus";
        return mode;
      });
  }

  /* ---------- 统一接口（均返回 Promise） ---------- */

  // 批量拉取全部统计，写入缓存并返回
  function fetchAllStats() {
    return detectMode().then(function (m) {
      if (m === "backend") {
        return fetch("/api/content/stats")
          .then(readBackendData)
          .then(function (data) {
            if (data && typeof data === "object") statsCache = data;
            return statsCache;
          });
      }
      // abacus：无批量接口，按 window.POSTS 的 id 列表并发拉取每条 view/like
      var posts = (typeof window !== "undefined" && window.POSTS) || [];
      var ids = posts
        .map(function (p) {
          return p && p.id;
        })
        .filter(Boolean);
      return Promise.all(
        ids.map(function (id) {
          return Promise.all([abacusGet(abacusKeyView(id)), abacusGet(abacusKeyLike(id))]).then(
            function (arr) {
              statsCache[id] = { viewCount: arr[0], likeCount: arr[1] };
            }
          );
        })
      ).then(function () {
        return statsCache;
      });
    });
  }

  // 拉取单条统计，更新缓存并返回该条
  function fetchStats(id) {
    return detectMode().then(function (m) {
      if (m === "backend") {
        return fetch("/api/content/" + encodeURIComponent(id) + "/stats")
          .then(readBackendData)
          .then(function (data) {
            if (data && typeof data === "object") statsCache[id] = data;
            return statsCache[id];
          });
      }
      return Promise.all([abacusGet(abacusKeyView(id)), abacusGet(abacusKeyLike(id))]).then(
        function (arr) {
          statsCache[id] = { viewCount: arr[0], likeCount: arr[1] };
          return statsCache[id];
        }
      );
    });
  }

  // 上报浏览（+1），返回最新 viewCount 并同步缓存
  function reportView(id) {
    return detectMode().then(function (m) {
      if (m === "backend") {
        return fetch("/api/content/" + encodeURIComponent(id) + "/view", {
          method: "POST"
        })
          .then(readBackendData)
          .then(function (data) {
            var vc = toCount(data && data.viewCount);
            if (!statsCache[id]) statsCache[id] = { viewCount: 0, likeCount: 0 };
            statsCache[id].viewCount = vc;
            return vc;
          });
      }
      return abacusHit(abacusKeyView(id)).then(function (vc) {
        // vc === -1 表示请求失败，维持缓存原值
        if (vc < 0) {
          return statsCache[id] ? statsCache[id].viewCount : 0;
        }
        if (!statsCache[id]) statsCache[id] = { viewCount: 0, likeCount: 0 };
        statsCache[id].viewCount = vc;
        return vc;
      });
    });
  }

  // 上报点赞（+1，可累加），返回最新 likeCount 并同步缓存
  function reportLike(id) {
    return detectMode().then(function (m) {
      if (m === "backend") {
        return fetch("/api/content/" + encodeURIComponent(id) + "/like", {
          method: "POST"
        })
          .then(readBackendData)
          .then(function (data) {
            var lc = toCount(data && data.likeCount);
            if (!statsCache[id]) statsCache[id] = { viewCount: 0, likeCount: 0 };
            statsCache[id].likeCount = lc;
            return lc;
          });
      }
      return abacusHit(abacusKeyLike(id)).then(function (lc) {
        if (lc < 0) {
          return statsCache[id] ? statsCache[id].likeCount : 0;
        }
        if (!statsCache[id]) statsCache[id] = { viewCount: 0, likeCount: 0 };
        statsCache[id].likeCount = lc;
        return lc;
      });
    });
  }

  /* ---------- 导出 ---------- */
  if (typeof window !== "undefined") {
    window.Stats = {
      formatCount: formatCount,
      fetchAllStats: fetchAllStats,
      fetchStats: fetchStats,
      reportView: reportView,
      reportLike: reportLike,
      getCache: function () {
        return statsCache;
      },
      // 调试可见当前模式（'unknown' 表示尚未探测）
      getMode: function () {
        return mode;
      }
    };
  }

  // Node require：只导出纯函数，避免引用 window / fetch
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatCount: formatCount };
  }
})();
