/* Infighting - 统计模块（新版：服务端 API 客户端）
 * 浏览数 / 点赞数改为调用 Express 接口，服务端统一计数、并发安全、可跨设备累加。
 * 兼容 UMD：浏览器挂到 window.Stats，Node 下可被 require（仅导出 formatCount 纯函数）。
 * 约定：window / fetch 只在函数体内引用，保证 Node 端 require 不报错。
 */
(function () {
  "use strict";

  // 数值保底为非负整数
  function toCount(v) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  /* ---------- 展示工具（纯函数，保留原缩写逻辑） ---------- */
  function formatCount(n) {
    n = toCount(n);
    if (n < 1000) return String(n);
    var k = n / 1000;
    return (k >= 100 ? Math.round(k) : Math.round(k * 10) / 10) + "k";
  }

  // 浏览器端统计缓存：{ [id]: { viewCount, likeCount } }
  var statsCache = {};

  // 同源相对路径（与静态站点同源，免 CORS）
  function endpoint(suffix) {
    return "/api/content" + suffix;
  }

  /* ---------- 接口封装（均返回 Promise） ---------- */

  // 批量拉取全部统计，写入缓存并返回
  function fetchAllStats() {
    return fetch(endpoint("/stats"))
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json && json.code === 0 && json.data) {
          statsCache = json.data;
        }
        return statsCache;
      });
  }

  // 拉取单条统计，更新缓存并返回该条
  function fetchStats(id) {
    return fetch(endpoint("/" + encodeURIComponent(id) + "/stats"))
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json && json.code === 0 && json.data) {
          statsCache[id] = json.data;
        }
        return statsCache[id];
      });
  }

  // 上报浏览（+1），返回最新 viewCount 并同步缓存
  function reportView(id) {
    return fetch(endpoint("/" + encodeURIComponent(id) + "/view"), {
      method: "POST"
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json && json.code === 0 && json.data) {
          var vc = toCount(json.data.viewCount);
          if (!statsCache[id]) statsCache[id] = { viewCount: 0, likeCount: 0 };
          statsCache[id].viewCount = vc;
          return vc;
        }
        return 0;
      });
  }

  // 上报点赞（+1，可累加），返回最新 likeCount 并同步缓存
  function reportLike(id) {
    return fetch(endpoint("/" + encodeURIComponent(id) + "/like"), {
      method: "POST"
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (json && json.code === 0 && json.data) {
          var lc = toCount(json.data.likeCount);
          if (!statsCache[id]) statsCache[id] = { viewCount: 0, likeCount: 0 };
          statsCache[id].likeCount = lc;
          return lc;
        }
        return 0;
      });
  }

  // 浏览器：暴露完整 API
  if (typeof window !== "undefined") {
    window.Stats = {
      formatCount: formatCount,
      fetchAllStats: fetchAllStats,
      fetchStats: fetchStats,
      reportView: reportView,
      reportLike: reportLike,
      getCache: function () {
        return statsCache;
      }
    };
  }

  // Node require：只导出纯函数，避免引用 window / fetch
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatCount: formatCount };
  }
})();
